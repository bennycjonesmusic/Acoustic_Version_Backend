// test_cron_payout.js
// Automated test for the commission payout cron job
// Usage: node test_cron_payout.js
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { processCommissionPayouts } from './utils/commissionPayoutCron.js';
import CommissionRequest from './models/CommissionRequest.js';

const BASE_URL = 'http://localhost:3000';
const CUSTOMER_EMAIL = 'acousticversionuk@gmail.com';
const CUSTOMER_PASSWORD = 'Moobslikejabba123456';
const ARTIST_EMAIL = 'sarahandbenduo@gmail.com';
const ARTIST_PASSWORD = 'Moobslikejabba123456';

async function login(email, password) {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
        login: email,
        password: password,
    });
    if (!response.data.token) {
        throw new Error('Login failed, no token returned' + response.data.error || '');
    }
    return response.data.token;
}

async function main() {
  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI);

  // Clear CommissionRequest collection before running test
  await CommissionRequest.deleteMany({});
  console.log('Cleared CommissionRequest collection.');

  // 1. Login as customer and artist
  console.log('[TEST DEBUG] Logging in as customer...');
  const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  console.log('[TEST DEBUG] Customer login token:', customerToken ? 'REDACTED' : 'FAILED');
  console.log('[TEST DEBUG] Logging in as artist...');
  const artistToken = await login(ARTIST_EMAIL, ARTIST_PASSWORD);
  console.log('[TEST DEBUG] Artist login token:', artistToken ? 'REDACTED' : 'FAILED');

  if (! customerToken || !artistToken) {
    throw new Error('Login failed, no tokens returned');
    console.error('Customer token:', customerToken);
    console.error('Artist token:', artistToken);
  } 
let artistId, artistRes;
  // 2. Get artist userId
  try { // try-catch because error keeps happening here
  console.log('[TEST DEBUG] Fetching artist userId...');
  artistRes = await axios.get(`${BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${artistToken}` }
  });
  artistId = artistRes.data.id || artistRes.data._id || (artistRes.data.user && (artistRes.data.user.id || artistRes.data.user._id));
  console.log('Artist userId:', artistId);
} catch (err){
    console.error('Error fetching artist userId:', err.response ? err.response.data : err);
    throw new Error('Failed to fetch artist userId');
}
  // 3. Set artist commissionPrice to £10
  console.log('[TEST DEBUG] Setting artist commission price to £10...');
  await axios.patch(`${BASE_URL}/users/profile`, { commissionPrice: 10 }, {
    headers: { Authorization: `Bearer ${artistToken}` }
  });

  // 4. Approve artist as admin
  const adminToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD); // Use customer as admin for test
  
  try{
  console.log('[TEST DEBUG] Approving artist as admin...');
  await axios.post(`${BASE_URL}/admin/approve-artist/${artistId}`, {}, {
    headers: { Authorization: `Bearer ${adminToken}` }
  });

} catch (err) {
//think this bit was the bit that was causing the error
    console.error('Artist already approved', err.response ? err.response.data : err);
}

  // 5. Create commission request as customer
  console.log('[TEST DEBUG] Creating commission request...');
  const commissionReq = await axios.post(`${BASE_URL}/commission/request`, {
    artist: artistId,
    requirements: "Please create a test track for automation.",
    key: "C",
    tempo: 120
  }, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  const commissionId = commissionReq.data.commissionId || commissionReq.data._id || commissionReq.data.id;
  // Log and assert price breakdown for transparency
  console.log("Commission request created:", commissionId);
  console.log("Commission price breakdown:", commissionReq.data);
  if (commissionReq.data.artistPrice !== 10) throw new Error('artistPrice should be 10');
  if (commissionReq.data.platformCommission !== 1.5) throw new Error('platformCommission should be 1.5');
  if (commissionReq.data.finalPrice !== 11.5) throw new Error('finalPrice should be 11.5');

  // 6. Artist accepts commission
  console.log('[TEST DEBUG] Artist accepting commission...');
  await axios.post(`${BASE_URL}/commission/artist/respond`, {
    commissionId,
    action: 'accept'
  }, {
    headers: { Authorization: `Bearer ${artistToken}` }
  });

  // 7. Customer pays (get Stripe Checkout URL and wait for manual payment)
  console.log('[TEST DEBUG] Creating Stripe Checkout session for commission payment...');
  console.log('[TEST] About to trigger Stripe Checkout/payment for commission:', commissionId);
  const paymentSessionRes = await axios.post(`${BASE_URL}/commission/pay`, { commissionId }, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  const paymentCheckoutUrl = paymentSessionRes.data.sessionUrl || (paymentSessionRes.data.sessionId && `https://checkout.stripe.com/pay/${paymentSessionRes.data.sessionId}`);
  console.log('[TEST DEBUG] Stripe Checkout session response:', paymentSessionRes.data);
  if (paymentCheckoutUrl) {
    console.log('[TEST DEBUG] About to open Stripe Checkout URL:', paymentCheckoutUrl);
    console.log("\n--- ACTION REQUIRED ---");
    console.log("Open this Stripe Checkout URL in your browser and complete the payment:");
    console.log(paymentCheckoutUrl);
    console.log("----------------------\n");
    // Wait for user to press Enter before continuing
    const readline = (await import('readline')).default;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('[TEST DEBUG] Waiting for user to signal payment completion...');
    await new Promise(resolve => rl.question('Press Enter after completing payment in Stripe Checkout...', () => { rl.close(); resolve(); }));
    console.log('[TEST DEBUG] User signaled payment completed.');
  }

  // 8. Artist uploads finished track
  console.log('[TEST DEBUG] Uploading finished track as artist...');
  const form = new FormData();
  form.append('commissionId', commissionId);
  let __dirname;
  if (typeof __filename === 'undefined') {
    const url = new URL(import.meta.url);
    __dirname = path.dirname(url.pathname.startsWith('/') && process.platform === 'win32' ? url.pathname.slice(1) : url.pathname);
  } else {
    __dirname = path.dirname(__filename);
  }
  const samplePath = path.join(__dirname, 'test-assets', 'sample.mp3');
  form.append('file', fs.createReadStream(samplePath));
  await axios.post(`${BASE_URL}/commission/upload-finished`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${artistToken}`
    }
  });
  console.log('[TEST DEBUG] Finished track uploaded.');

  // 9. Customer approves preview (moves to 'approved')
  console.log('[TEST DEBUG] Customer approving preview...');
  await axios.post(`${BASE_URL}/commission/confirm`, {
    commissionId,
    action: 'approve'
  }, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  console.log('[TEST DEBUG] Preview approved.');

  // 10. Set commission status to 'cron_pending' (simulate payment received, waiting for cron)
  await CommissionRequest.findByIdAndUpdate(commissionId, { $set: { status: 'cron_pending' } });
  console.log('Commission set to cron_pending for payout test.');

  // Wait for Stripe webhook to set stripePaymentIntentId and for payment to succeed
  let tries = 0;
  let commission;
  while (tries < 10) {
    commission = await CommissionRequest.findById(commissionId);
    console.log(`[POLL DEBUG] Try ${tries + 1}: Commission:`, commission);
    if (commission.stripePaymentIntentId) {
      // Optionally, check payment intent status via Stripe API here
      break;
    }
    await new Promise(res => setTimeout(res, 3000)); // wait 3 seconds
    tries++;
  }
  if (!commission.stripePaymentIntentId) {
    throw new Error('stripePaymentIntentId not set after waiting for Stripe webhook.');
  }
  console.log('[TEST DEBUG] Stripe webhook received and stripePaymentIntentId set:', commission.stripePaymentIntentId);

  // 11. Run cron payout
  console.log('[TEST DEBUG] Running commission payout cron...');
  await processCommissionPayouts();

  // 12. Check commission status
  commission = await CommissionRequest.findById(commissionId);
  console.log('Commission after cron payout:', commission.status, commission.stripeTransferId);

  // Disconnect from MongoDB
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('Test failed:', err.response ? err.response.data : err);
  process.exit(1);
});
