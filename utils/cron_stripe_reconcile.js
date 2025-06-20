import dotenv from 'dotenv';
import mongoose from 'mongoose';
import stripe from 'stripe';
import User from '../models/User.js';
import CommissionRequest from '../models/CommissionRequest.js';

dotenv.config();

const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// Removed connectDB, as connection is handled by server.js

async function reconcileStripePayments() {
  try {
    console.log('[CRON RECONCILE] Starting reconciliation of Stripe payments...');
    // Fetch recent successful checkout sessions (last 45 minutes)
    const since = Math.floor(Date.now() / 1000) - 45 * 60;
    let hasMore = true;
    let startingAfter = undefined;
    let processed = 0;
    while (hasMore) {
      const sessions = await stripeClient.checkout.sessions.list({
        limit: 100,
        created: { gte: since },
        ...(startingAfter ? { starting_after: startingAfter } : {})
      });
      for (const session of sessions.data) {
        if (session.payment_status !== 'paid') continue;
        const metadata = session.metadata || {};
        // Handle commissions
        if (metadata.commissionId) {
          const commission = await CommissionRequest.findById(metadata.commissionId);
          if (commission && commission.status === 'requested') {
            commission.status = 'in_progress';
            commission.stripeSessionId = session.id;
            await commission.save();
            console.log(`[CRON RECONCILE] Updated commission ${commission._id} to in_progress`);
          }
        }
        // Handle purchased tracks (if you store trackId in metadata)
        if (metadata.trackId && metadata.customerId) {
          const user = await User.findById(metadata.customerId);
          if (user) {
            user.purchasedTracks = user.purchasedTracks || [];
            // Ensure no duplicates and only add if not present
            if (!user.purchasedTracks.includes(metadata.trackId)) {
              user.purchasedTracks.push(metadata.trackId);
              await user.save();
              console.log(`[CRON RECONCILE] Added track ${metadata.trackId} to user ${user.email}`);
            } else {
              console.log(`[CRON RECONCILE] Track ${metadata.trackId} already in purchasedTracks for user ${user.email}, skipping.`);
            }
          }
        }
        processed++;
      }
      hasMore = sessions.has_more;
      if (hasMore) startingAfter = sessions.data[sessions.data.length - 1].id;
    }
    console.log(`[CRON RECONCILE] Reconciliation complete. Processed ${processed} sessions.`);
  } catch (error) {
    console.error('[CRON RECONCILE] Error during reconciliation:', error);
  }
}

export { reconcileStripePayments };
