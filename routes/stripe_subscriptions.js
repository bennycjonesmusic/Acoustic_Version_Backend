import express from 'express';
import Stripe from 'stripe';
import authMiddleware from '../middleware/customer_auth.js';
import User from '../models/User.js';
import http from 'http';

const stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
const router = express.Router();

// Subscription prices (replace with your Stripe price IDs)
const SUBSCRIPTION_PRICES = {
  pro: process.env.STRIPE_PRO_PRICE_ID,
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID
};

// Helper function to check webhook health
async function checkStripeWebhookHealth() {
  const webhookHealthUrl = 'http://localhost:3000/webhook/stripe/health';
  return await new Promise((resolve) => {
    http.get(webhookHealthUrl, (resp) => {
      resolve(resp.statusCode === 200);
    }).on('error', () => resolve(false));
  });
}

// Health check for Stripe webhook
// const checkStripeWebhookHealth = async () => {
//   try {
//     const response = await stripeClient.webhookEndpoints.list();
//     return response.data.length > 0;
//   } catch (error) {
//     console.error('Error checking Stripe webhook health:', error);
//     return false;
//   }
// };

// Create Stripe Checkout Session for subscription upgrade
router.post('/create-subscription-session', authMiddleware, async (req, res) => {
  try {
    const healthCheck = await checkStripeWebhookHealth();
    if (!healthCheck) {
      return res.status(503).json({ error: 'Stripe webhook is not running. Please try again later.' });
    }
    const { tier } = req.body;
    if (!['pro', 'enterprise'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: SUBSCRIPTION_PRICES[tier],
          quantity: 1
        }
      ],
      customer_email: user.email,
      success_url: `${process.env.CLIENT_URL}/upgrade-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/upgrade-cancel`,
      metadata: {
        userId: user._id.toString(),
        tier
      }
    });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Error creating subscription session:', error);
    return res.status(500).json({ error: 'Failed to create subscription session' });
  }
});

// Cancel a Stripe subscription for the authenticated user
router.post('/cancel-subscription', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.stripeSubscriptionId) {
      return res.status(404).json({ error: 'No active subscription found.' });
    }
    // Use only the Stripe v18+ .cancel method for subscription cancellation
    let result;
    if (typeof stripeClient.subscriptions.cancel === 'function') {
      result = await stripeClient.subscriptions.cancel(user.stripeSubscriptionId);
    } else {
      throw new Error('Stripe subscription cancellation method not found. Please check Stripe SDK version.');
    }
    // Downgrade user to free tier and clear subscriptionId
    user.subscriptionTier = 'free';
    user.stripeSubscriptionId = undefined;
    await user.save();
    return res.status(200).json({ message: 'Subscription cancelled and account downgraded.' });
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    return res.status(500).json({ error: 'Failed to cancel subscription.' });
  }
});

export default router;
