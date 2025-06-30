import express from 'express';
import Stripe from 'stripe';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import { sendPurchaseReceiptEmail, sendSaleNotificationEmail } from '../utils/emailAuthentication.js';
import { createCommissionRequestNotification, createTrackPurchaseNotification } from '../utils/notificationHelpers.js';
import fs from 'fs';
import dotenv from 'dotenv';
import { stripeWebhookHealth } from '../controllers/commissionControl.js';

dotenv.config();

// Function to trigger fast payout after cart purchases
async function triggerFastPayout() {
  console.log('[FAST PAYOUT] Scheduling payout in 30 seconds after cart purchase...');
  setTimeout(async () => {
    try {
      console.log('[FAST PAYOUT] Processing triggered payout...');
      const { processPayouts } = await import('../utils/cron_payout_money_owed.js');
      await processPayouts();
      console.log('[FAST PAYOUT] Triggered payout completed');
    } catch (error) {
      console.error('[FAST PAYOUT] Error in triggered payout:', error);
    }
  }, 30000); // 30 seconds
}

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
  let event;  try {
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
    
    // Handle cart purchase (multiple tracks)
    if (session.metadata && session.metadata.purchaseType === 'cart') {
      const userId = session.metadata.userId;
      const trackIds = session.metadata.trackIds.split(',');
      const artistPayouts = JSON.parse(session.metadata.artistPayouts);

      const user = await User.findById(userId);
      const tracks = await BackingTrack.find({ _id: { $in: trackIds } });

      if (user && tracks.length > 0) {        // Add all tracks to user's purchases (check for existing payment intent to avoid duplicates)
        for (const track of tracks) {
          const trackIdString = (track._id || track.id).toString();
          const alreadyPurchased = user.purchasedTracks.some(
            p => p.track.toString() === trackIdString && p.paymentIntentId === session.payment_intent
          );          if (!alreadyPurchased) {user.purchasedTracks.push({
              track: track._id || track.id,
              paymentIntentId: session.payment_intent,
              purchasedAt: new Date(),
              price: track.customerPrice, // ✅ Store customer price (what they actually paid)
              refunded: false
            });
            track.purchaseCount = (track.purchaseCount || 0) + 1;
            await track.save();
            
            // Create purchase notification for the artist
            try {
              await createTrackPurchaseNotification(
                track.user, // artistId
                user.username, // buyerUsername
                track._id, // trackId
                track.title // trackTitle
              );
              console.log(`[WEBHOOK] Created purchase notification for artist ${track.user} for track "${track.title}"`);
            } catch (notificationError) {
              console.error('[WEBHOOK] Error creating purchase notification:', notificationError);
            }
          }
        }

        // Clear user's cart
        user.cart = [];
        await user.save();        // Update all artists' stats
        for (const [artistId, payoutData] of Object.entries(artistPayouts)) {
          const artist = await User.findById(artistId);
          if (artist) {
            artist.amountOfTracksSold = (artist.amountOfTracksSold || 0) + payoutData.tracks.length;
            artist.totalIncome = (artist.totalIncome || 0) + payoutData.totalEarnings;
            await artist.save();
          }
        }        // Add money owed to artists for cart purchases
        for (const [artistId, payoutData] of Object.entries(artistPayouts)) {
          const artist = await User.findById(artistId);
          if (artist) {
            // Create reference for the money owed
            const trackTitles = payoutData.tracks.map(trackId => {
              const track = tracks.find(t => t._id.toString() === trackId);
              return track ? track.title : `Track ${trackId}`;
            }).join(', ');
            
            const reference = `Cart purchase: ${trackTitles} @ ${new Date().toLocaleDateString()}`;              // Add to money owed - this will be paid by cron job
            artist.moneyOwed.push({
              amount: payoutData.totalEarnings, // Amount in pounds
              reference: reference,
              source: 'cart_purchase',
              metadata: {
                type: 'track_purchase_payout',
                userId: userId,
                trackIds: Array.isArray(payoutData.tracks) ? payoutData.tracks.join(',') : payoutData.tracks.toString(),
                purchaseType: 'cart',
                paymentIntentId: session.payment_intent,
                customerEmail: session.customer_email,
                payoutReason: 'Track purchase completed'
              }
            });
            
            await artist.save();
            console.log(`Added £${payoutData.totalEarnings} to money owed for artist ${artistId}: ${reference}`);
          }        }        console.log(`Cart purchase completed: ${trackIds.length} tracks for user ${userId}`);
        
        // Trigger fast payout for testing (30 seconds after cart purchase)
        if (process.env.NODE_ENV !== 'production') {
          console.log('[FAST PAYOUT] Cart purchase detected - triggering fast payout for testing');
          try {
            await triggerFastPayout();
          } catch (error) {
            console.error('[FAST PAYOUT] Error triggering fast payout:', error);
          }
        } else {
          console.log('[PAYOUT] Cart purchase completed - payouts will be processed by hourly cron job');
        }
      }
    }
    // Handle standard track purchase (existing logic)
    else if (session.metadata && session.metadata.userId && session.metadata.trackId) {
      const userId = session.metadata.userId;
      const trackId = session.metadata.trackId;
      const user = await User.findById(userId);
      const track = await BackingTrack.findById(trackId);
      if (user && track) {        // Only add if not already purchased (check payment intent to avoid duplicates)
        const alreadyPurchased = user.purchasedTracks.some(
          p => p.track.toString() === track._id.toString() && p.paymentIntentId === session.payment_intent
        );        if (!alreadyPurchased) {          user.purchasedTracks.push({
            track: track._id || track.id,
            paymentIntentId: session.payment_intent,
            purchasedAt: new Date(),
            price: track.customerPrice, // ✅ Store customer price (what they actually paid)
            refunded: false
          });
          await user.save();
          // Only increment purchaseCount if not already purchased
          track.purchaseCount = (track.purchaseCount || 0) + 1;
          
          // Create purchase notification for the artist
          try {
            await createTrackPurchaseNotification(
              track.user, // artistId
              user.username, // buyerUsername
              track._id, // trackId
              track.title // trackTitle
            );
            console.log(`[WEBHOOK] Created purchase notification for artist ${track.user} for track "${track.title}"`);
          } catch (notificationError) {
            console.error('[WEBHOOK] Error creating purchase notification:', notificationError);
          }
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
          console.log('[WEBHOOK DEBUG] Commission status before possible update:', commission.status);          if (
            commission.status === 'requested' ||
            commission.status === 'accepted' ||
            commission.status === 'in_progress'
          ) {
            commission.status = 'in_progress';
            console.log('[WEBHOOK DEBUG] Commission status set to in_progress');
            
            // Create notification for artist that they have a new commission request
            try {
              await createCommissionRequestNotification(
                commission.artist._id,
                commission.customer.username,
                commission._id
              );
            } catch (notifError) {
              console.error('[WEBHOOK DEBUG] Error creating commission request notification:', notifError);
            }
          } else {
            console.log('[WEBHOOK DEBUG] Commission status NOT set to in_progress (current status:', commission.status, ')');
          }
          try {
            await commission.save();
            console.log('[WEBHOOK DEBUG] Commission after update:', commission);
          } catch (saveErr) {
            console.error('[WEBHOOK DEBUG] Error saving commission:', saveErr);
          }
          
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
      // Find the user by the canceled subscription ID
      const user = await User.findOne({ stripeSubscriptionId: subscriptionId });
      if (user) {
        // Check if user has any other active paid subscription (pro or enterprise)
        const hasOtherActivePaid = await User.exists({
          _id: user._id,
          subscriptionTier: { $in: ['pro', 'enterprise'] },
          stripeSubscriptionId: { $ne: subscriptionId, $exists: true, $ne: null }
        });
        if (!hasOtherActivePaid) {
          user.subscriptionTier = 'free';
          user.stripeSubscriptionId = undefined;
          await user.save();
          console.log(`[WEBHOOK] Downgraded user ${user.email} to free tier after subscription cancellation.`);
        } else {
          console.log(`[WEBHOOK] Subscription ${subscriptionId} ended, but user ${user.email} has another active paid subscription. No downgrade.`);
        }
      }
    } catch (err) {
      console.error('[WEBHOOK] Error downgrading user after subscription cancellation:', err);
    }
  }  // Handle Stripe Connect account updates
  else if (event.type === 'account.updated') {
    const account = event.data.object;
    console.log(`[WEBHOOK DEBUG] account.updated event received for account: ${account.id}`);
    console.log(`[WEBHOOK DEBUG] charges_enabled: ${account.charges_enabled}`);
    console.log(`[WEBHOOK DEBUG] payouts_enabled: ${account.payouts_enabled}`);
    console.log(`[WEBHOOK DEBUG] requirements:`, account.requirements);
    
    try {
      const user = await User.findOne({ stripeAccountId: account.id });
      console.log(`[WEBHOOK DEBUG] Found user for account ${account.id}:`, user ? user.email : 'NOT FOUND');
      
      if (user) {
        console.log(`[WEBHOOK DEBUG] Current user status - stripeAccountStatus: ${user.stripeAccountStatus}, stripePayoutsEnabled: ${user.stripePayoutsEnabled}`);
        
        // Update account status based on Stripe account data
        if (account.charges_enabled && account.payouts_enabled) {
          user.stripeAccountStatus = 'active';
          user.stripePayoutsEnabled = true;
          user.stripeOnboardingComplete = true;
          console.log(`[WEBHOOK DEBUG] Setting account to ACTIVE (charges and payouts enabled)`);
        } else if (account.requirements && account.requirements.disabled_reason) {
          user.stripeAccountStatus = account.requirements.disabled_reason === 'rejected.other' ? 'rejected' : 'restricted';
          user.stripePayoutsEnabled = account.payouts_enabled || false;
          user.stripeOnboardingComplete = false;
          console.log(`[WEBHOOK DEBUG] Setting account to ${user.stripeAccountStatus} (disabled_reason: ${account.requirements.disabled_reason})`);
        } else {
          user.stripeAccountStatus = 'pending';
          user.stripePayoutsEnabled = account.payouts_enabled || false;
          user.stripeOnboardingComplete = false;
          console.log(`[WEBHOOK DEBUG] Setting account to PENDING`);
        }
        await user.save();
        console.log(`[WEBHOOK] Updated Stripe account status for user ${user.email}: status=${user.stripeAccountStatus}, payouts=${user.stripePayoutsEnabled}, complete=${user.stripeOnboardingComplete}`);
      } else {
        console.log(`[WEBHOOK DEBUG] No user found with stripeAccountId: ${account.id}`);
      }
    } catch (err) {
      console.error('[WEBHOOK] Error updating user Stripe account status:', err);
    }
  }

  res.status(200).send('Received');
});

router.get('/health', stripeWebhookHealth);

export default router;

