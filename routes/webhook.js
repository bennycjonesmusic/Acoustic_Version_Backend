import express from 'express';
import Stripe from 'stripe';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import { sendPurchaseReceiptEmail, sendSaleNotificationEmail } from '../utils/emailAuthentication.js';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

console.log('[WEBHOOK DEBUG] webhook.js module loaded');
console.log('[WEBHOOK DEBUG] Registering /webhook route');
console.log('[WEBHOOK DEBUG] Loaded STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? '***' + process.env.STRIPE_WEBHOOK_SECRET.slice(-6) : 'NOT SET');
//webhook is used to send data from stripe to my server

//no json for webhook 
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  console.log('[WEBHOOK DEBUG] Incoming POST /webhook - RAW BODY LENGTH:', req.body.length);
  try {
    fs.writeFileSync('webhook_raw_body.log', req.body);
  } catch (e) {
    console.error('[WEBHOOK DEBUG] Failed to write raw body to file:', e);
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    console.log('[WEBHOOK DEBUG] Attempting to construct Stripe event');
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('Webhook event received:', event.type);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Log the event for debugging
  console.log('Event payload:', JSON.stringify(event, null, 2));

  // Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    // Log metadata for debugging
    console.log('[WEBHOOK DEBUG] session.metadata:', session.metadata);
    // Handle standard track purchase (existing logic)
    if (session.metadata && session.metadata.userId && session.metadata.trackId) {
      const userId = session.metadata.userId;
      const trackId = session.metadata.trackId;
      const user = await User.findById(userId);
      const track = await BackingTrack.findById(trackId);
      if (user && track) {
        // Only add if not already purchased
        const alreadyPurchased = user.purchasedTracks.some(
          p => p.track.toString() === track._id.toString() && !p.refunded
        );
        if (!alreadyPurchased) {
          user.purchasedTracks.push({
            track: track._id,
            paymentIntentId: session.payment_intent,
            purchasedAt: new Date(),
            price: track.price,
            refunded: false
          });
          await user.save();
          // Only increment purchaseCount if not already purchased
          track.purchaseCount = (track.purchaseCount || 0) + 1;
        }
        const artist = await User.findById(track.user);
        if (artist) {
          artist.amountOfTracksSold += 1;
          artist.totalIncome = (artist.totalIncome || 0) + (track.price || 0);
          await artist.save();
        }
        await track.save();
        console.log(`Purchase recorded for ${user.email}`);
        // Send purchase receipt to buyer
        if (user.email && process.env.NODE_ENV !== 'test') {
          await sendPurchaseReceiptEmail(user.email, track, artist, session);
        }
        // Send sale notification to seller
        if (artist && artist.email && process.env.NODE_ENV !== 'test') {
          await sendSaleNotificationEmail(artist.email, track, user, session);
        }
      } else {
        console.error('User or track not found:', { userId, trackId });
      }
    }
    // Handle commission payment
    else if (session.metadata && session.metadata.commissionId) {
      try {
        const commissionId = session.metadata.commissionId;
        console.log('[WEBHOOK DEBUG] Incoming commissionId:', commissionId, 'session.payment_intent:', session.payment_intent);
        const CommissionRequest = (await import('../models/CommissionRequest.js')).default;
        const User = (await import('../models/User.js')).default;
        const commission = await CommissionRequest.findById(commissionId).populate('artist customer');
        console.log('[WEBHOOK DEBUG] Looking up commission:', commissionId, 'Found:', !!commission);
        if (commission) {
          console.log('[WEBHOOK DEBUG] Commission before update:', commission);
          // Always set stripePaymentIntentId, regardless of status
          commission.stripePaymentIntentId = session.payment_intent;
          // Only set to 'in_progress' if in a pre-payment state
          console.log('[WEBHOOK DEBUG] Commission status before possible update:', commission.status);
          if (
            commission.status === 'requested' ||
            commission.status === 'accepted' ||
            commission.status === 'in_progress'
          ) {
            commission.status = 'in_progress';
            console.log('[WEBHOOK DEBUG] Commission status set to in_progress');
          } else {
            console.log('[WEBHOOK DEBUG] Commission status NOT set to in_progress (current status:', commission.status, ')');
          }
          try {
            await commission.save();
            console.log('[WEBHOOK DEBUG] Commission after update:', commission);
          } catch (saveErr) {
            console.error('[WEBHOOK DEBUG] Error saving commission:', saveErr);
          }
          console.log(`[WEBHOOK DEBUG] Commission payment received for commission ${commissionId}, status is now ${commission.status}.`);
          // Send purchase receipt to client and notification to artist (commission)
          if (commission.customer && commission.customer.email && process.env.NODE_ENV !== 'test') {
            console.log('[WEBHOOK DEBUG] Sending purchase receipt email to customer:', commission.customer.email);
            await sendPurchaseReceiptEmail(commission.customer.email, commission, commission.artist, session);
          } else {
            console.log('[WEBHOOK DEBUG] No customer email found for commission or in test mode:', commissionId);
          }
          if (commission.artist && commission.artist.email && process.env.NODE_ENV !== 'test') {
            console.log('[WEBHOOK DEBUG] Sending sale notification email to artist:', commission.artist.email);
            await sendSaleNotificationEmail(commission.artist.email, commission, commission.customer, session);
          } else {
            console.log('[WEBHOOK DEBUG] No artist email found for commission or in test mode:', commissionId);
          }
        } else {
          console.error('[WEBHOOK DEBUG] Commission not found:', commissionId);
        }
      } catch (err) {
        console.error('Error handling commission payment:', err);
      }
    }
    // Handle subscription upgrade
    if (session.metadata && session.metadata.userId && session.metadata.tier && session.subscription) {
      const userId = session.metadata.userId;
      const tier = session.metadata.tier;
      const subscriptionId = session.subscription;
      if (["pro", "enterprise"].includes(tier)) {
        try {
          const user = await User.findById(userId);
          if (user) {
            user.subscriptionTier = tier;
            user.stripeSubscriptionId = subscriptionId;
            await user.save();
            console.log(`[WEBHOOK] Upgraded user ${user.email} to tier: ${tier}, subscriptionId: ${subscriptionId}`);
          } else {
            console.error('[WEBHOOK] User not found for subscription upgrade:', userId);
          }
        } catch (err) {
          console.error('[WEBHOOK] Error upgrading user subscription tier:', err);
        }
      }
    }  }
  // Handle subscription cancellation (downgrade user)
  else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const subscriptionId = subscription.id;
    try {
      const user = await User.findOne({ stripeSubscriptionId: subscriptionId });
      if (user) {
        user.subscriptionTier = 'free';
        user.stripeSubscriptionId = undefined;
        await user.save();
        console.log(`[WEBHOOK] Downgraded user ${user.email} to free tier after subscription cancellation.`);
      }
    } catch (err) {
      console.error('[WEBHOOK] Error downgrading user after subscription cancellation:', err);
    }
  }
  // Handle Stripe Connect account updates
  else if (event.type === 'account.updated') {
    const account = event.data.object;
    try {
      const user = await User.findOne({ stripeAccountId: account.id });
      if (user) {
        // Update account status based on Stripe account data
        if (account.charges_enabled && account.payouts_enabled) {
          user.stripeAccountStatus = 'active';
          user.stripePayoutsEnabled = true;
          user.stripeOnboardingComplete = true;
        } else if (account.requirements && account.requirements.disabled_reason) {
          user.stripeAccountStatus = account.requirements.disabled_reason === 'rejected.other' ? 'rejected' : 'restricted';
          user.stripePayoutsEnabled = account.payouts_enabled || false;
          user.stripeOnboardingComplete = false;
        } else {
          user.stripeAccountStatus = 'pending';
          user.stripePayoutsEnabled = account.payouts_enabled || false;
          user.stripeOnboardingComplete = false;
        }
        await user.save();
        console.log(`[WEBHOOK] Updated Stripe account status for user ${user.email}: status=${user.stripeAccountStatus}, payouts=${user.stripePayoutsEnabled}, complete=${user.stripeOnboardingComplete}`);
      }
    } catch (err) {
      console.error('[WEBHOOK] Error updating user Stripe account status:', err);
    }
  }

  res.status(200).send('Received');
});

export default router;

