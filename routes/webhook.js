import express from 'express';
import Stripe from 'stripe';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';

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
    if (!session.metadata || !session.metadata.userId || !session.metadata.trackId) {
      // Allow CLI test events to pass without error, but log a warning
      console.warn('Missing metadata in session (likely a Stripe CLI test event):', session);
      return res.status(200).send('Received (no metadata, likely test event)');
    }
    try {
      const userId = session.metadata.userId;
      const trackId = session.metadata.trackId;
      const user = await User.findById(userId);
      const track = await BackingTrack.findById(trackId);
      if (user && track) {
        // Only add if not already bought
        if (!user.boughtTracks.some(id => id.equals(track._id))) {
          user.boughtTracks.push(track._id);
          await user.save();
        }
        // Optionally increment download or purchase count
        track.purchaseCount = (track.purchaseCount || 0) + 1;
        const artist = await User.findById(track.user);
        if (artist) {
          artist.amountOfTracksSold += 1;
          await artist.save();
        }
        await track.save();
        console.log(`Purchase recorded for ${user.email}`);
      } else {
        console.error('User or track not found:', { userId, trackId });
      }
    } catch (err) {
      console.error('Error handling purchase:', err);
    }
  }

  res.status(200).send('Received');
});

export default router;

