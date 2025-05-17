import express from 'express';
import Stripe from 'stripe';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

//no json for webhook 
router.post('/', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle successful checkout
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      // You can include metadata during session creation to track user & track ID
      const userId = session.metadata.userId;
      const trackId = session.metadata.trackId;

      const user = await User.findById(userId);
      const track = await BackingTrack.findById(trackId);

      if (user && track) {
        // Add track to user's purchasedTracks
        user.purchasedTracks.push(track._id);
        await user.save();

        // Optionally increment download or purchase count
        track.purchaseCount = (track.purchaseCount || 0) + 1;
        await track.save();

        console.log(`Purchase recorded for ${user.email}`);
      }
    } catch (err) {
      console.error('Error handling purchase:', err);
    }
  }

  res.status(200).send('Received');
});

export default router;

//generated with AI.