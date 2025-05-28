// filepath: utils/commissionPayoutCron.js
// Cron job to process commission payouts at regular intervals
// Loops through all commissions that are approved and not yet paid, checks payment status and available balance, and pays out if possible

import CommissionRequest from '../models/CommissionRequest.js';
import User from '../models/User.js';
import stripe from 'stripe';
import dotenv from 'dotenv';
dotenv.config();
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

export async function processCommissionPayouts() {
  // Find all commissions that are cron_pending and not yet paid
  const commissions = await CommissionRequest.find({
    status: 'cron_pending',
    stripePaymentIntentId: { $exists: true, $ne: null },
    stripeTransferId: { $exists: false },
  }).populate('artist customer');

  for (const commission of commissions) {
    try {
      // Check payment intent status
      const paymentIntent = await stripeClient.paymentIntents.retrieve(commission.stripePaymentIntentId);
      if (paymentIntent.status !== 'succeeded') {
        console.log(`[PAYOUT CRON] Payment not succeeded for commission ${commission._id}`);
        continue;
      }
      // Check available balance
      const balance = await stripeClient.balance.retrieve();
      const totalAmount = Math.round(commission.price * 100); // pence
      const platformFee = Math.round(totalAmount * 0.15);
      const artistAmount = totalAmount - platformFee;
      const available = balance.available.find(b => b.currency === 'gbp');
      if (!available || available.amount < artistAmount) {
        console.log(`[PAYOUT CRON] Insufficient balance for commission ${commission._id}`);
        continue;
      }
      // Check artist Stripe account
      const artist = commission.artist;
      if (!artist.stripeAccountId) {
        console.log(`[PAYOUT CRON] Artist has no Stripe account for commission ${commission._id}`);
        continue;
      }
      if (artist.role !== 'artist' && artist.role !== 'admin') {
        console.log(`[PAYOUT CRON] Artist role not eligible for payout for commission ${commission._id}`);
        continue;
      }
      // Transfer to artist
      const transfer = await stripeClient.transfers.create({
        amount: artistAmount,
        currency: 'gbp',
        destination: artist.stripeAccountId,
        transfer_group: `commission_${commission._id}`,
        metadata: {
          commissionId: commission._id.toString(),
          artistId: artist._id.toString(),
        }
      });
      commission.status = 'paid';
      commission.stripeTransferId = transfer.id;
      await commission.save();
      console.log(`[PAYOUT CRON] Paid out commission ${commission._id} to artist ${artist._id}`);
    } catch (err) {
      console.error(`[PAYOUT CRON] Error processing commission ${commission._id}:`, err.message);
    }
  }
}
