import express from 'express';
import Stripe from 'stripe';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import { sendPurchaseReceiptEmail, sendSaleNotificationEmail } from '../utils/emailAuthentication.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

//webhook is used to send data from stripe to my server

//no json for webhook 
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
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
    // Handle standard track purchase (existing logic)
    if (session.metadata && session.metadata.userId && session.metadata.trackId) {
      const userId = session.metadata.userId;
      const trackId = session.metadata.trackId;
      const user = await User.findById(userId);
      const track = await BackingTrack.findById(trackId);
      if (user && track) {
        // Only add if not already purchased
        const alreadyPurchased = user.purchasedTracks.some(
          p => p.track.equals(track._id) && !p.refunded
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
        }
        // Optionally increment download or purchase count
        track.purchaseCount = (track.purchaseCount || 0) + 1;
        const artist = await User.findById(track.user);
        if (artist) {
          artist.amountOfTracksSold += 1;
          artist.totalIncome = (artist.totalIncome || 0) + (track.price || 0);
          await artist.save();
        }
        await track.save();
        console.log(`Purchase recorded for ${user.email}`);
        // Send purchase receipt to buyer
        if (user.email) {
          await sendPurchaseReceiptEmail(user.email, track, artist, session);
        }
        // Send sale notification to seller
        if (artist && artist.email) {
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
        const CommissionRequest = (await import('../models/CommissionRequest.js')).default;
        const commission = await CommissionRequest.findById(commissionId);
        if (commission) {
          commission.stripePaymentIntentId = session.payment_intent;
          commission.status = 'accepted'; // Mark as accepted/paid
          await commission.save();
          console.log(`Commission payment recorded for commission ${commissionId}`);
        } else {
          console.error('Commission not found:', commissionId);
        }
      } catch (err) {
        console.error('Error handling commission payment:', err);
      }
    }
  }

  res.status(200).send('Received');
});

export default router;

