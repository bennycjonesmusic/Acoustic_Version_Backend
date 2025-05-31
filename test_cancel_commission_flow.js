// test_cancel_commission_flow.js
// Test script for commission cancellation and refund
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'http://localhost:3000';
const CUSTOMER_EMAIL = 'acousticversionuk@gmail.com';
const CUSTOMER_PASSWORD = 'Moobslikejabba123456';
const ARTIST_EMAIL = 'sarahandbenduo@gmail.com';
const ARTIST_PASSWORD = 'Moobslikejabba123456';

async function login(email, password) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { login: email, password });
  return res.data.token;
}

async function main() {
  // Connect to MongoDB before any Mongoose model usage
  await mongoose.connect(process.env.MONGODB_URI);

  // Register customer and artist (mirror test_commission_flow.js logic)
  try {
    await axios.post(`${BASE_URL}/auth/register`, {
      username: 'CancelTestCustomer',
      email: CUSTOMER_EMAIL,
      password: CUSTOMER_PASSWORD,
      about: 'Customer for cancel test'
    });
  } catch {}
  try {
    await axios.post(`${BASE_URL}/auth/register`, {
      username: 'CancelTestArtist',
      email: ARTIST_EMAIL,
      password: ARTIST_PASSWORD,
      about: 'Artist for cancel test',
      role: 'artist'
    });
  } catch {}

  // Login
  const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  const artistToken = await login(ARTIST_EMAIL, ARTIST_PASSWORD);

  // Set artist commissionPrice
  await axios.patch(`${BASE_URL}/users/profile`, { commissionPrice: 10 }, {
    headers: { Authorization: `Bearer ${artistToken}` }
  });

  // Approve artist (use acousticversionuk@gmail.com as admin, sarahandbenduo@gmail.com as artist)
  let artistId;
  try {
    // Use customer (acousticversionuk@gmail.com) as admin for approval
    const adminToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
    const artistRes = await axios.get(`${BASE_URL}/users/me`, { headers: { Authorization: `Bearer ${artistToken}` } });
    artistId = artistRes.data.id || artistRes.data._id || (artistRes.data.user && (artistRes.data.user.id || artistRes.data.user._id));
    await axios.post(`${BASE_URL}/admin/approve-artist/${artistId}`, {}, { headers: { Authorization: `Bearer ${adminToken}` } });
  } catch {}

  // Create commission request (mirror test_commission_flow.js logic)
  const commissionReq = await axios.post(`${BASE_URL}/commission/request`, {
    title: "Test Commission Track",
    description: "Please create a test track for automation.",
    artist: artistId,
    requirements: "Please create a test track for automation.",
    key: "C",
    tempo: 120
  }, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  // Log the full response for debugging
  console.log("Commission request response:", commissionReq.data);
  // Try to extract commissionId from multiple possible fields
  const commissionId = commissionReq.data.commissionId || commissionReq.data._id || commissionReq.data.id;
  console.log("Commission request created:", commissionId);

  // Artist accepts
  const acceptRes = await axios.post(`${BASE_URL}/commission/artist/respond`, {
    commissionId,
    action: 'accept'
  }, {
    headers: { Authorization: `Bearer ${artistToken}` }
  });
  console.log('Artist accepted commission:', acceptRes.data);

  // Customer pays
  const paymentSessionRes = await axios.post(`${BASE_URL}/commission/pay`, {
    commissionId
  }, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  const paymentCheckoutUrl = paymentSessionRes.data.sessionUrl || (paymentSessionRes.data.sessionId && `https://checkout.stripe.com/pay/${paymentSessionRes.data.sessionId}`);
  if (paymentCheckoutUrl) {
    console.log("\n--- ACTION REQUIRED ---");
    console.log("Open this Stripe Checkout URL in your browser and complete the payment:");
    console.log(paymentCheckoutUrl);
    console.log("----------------------\n");
    // Wait for user to press Enter before continuing
    const readline = (await import('readline')).default;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => rl.question('Press Enter after completing payment in Stripe Checkout...', () => { rl.close(); resolve(); }));
  }

  // Upload finished track as artist (mirror test_commission_flow.js logic)
  const FormData = (await import('form-data')).default;
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
  const uploadRes = await axios.post(`${BASE_URL}/commission/upload-finished`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${artistToken}`
    }
  });
  const finishedTrackUrl = uploadRes.data.finishedTrackUrl;
  const previewTrackUrl = uploadRes.data.previewTrackUrl;
  console.log("Finished track uploaded for commission:", finishedTrackUrl);
  console.log("Preview track for client to check:", previewTrackUrl);

  // 5. Customer downloads and checks the preview
  if (previewTrackUrl) {
    const previewRes = await axios.get(`${BASE_URL}/commission/preview-for-client`, {
      params: { commissionId },
      headers: { Authorization: `Bearer ${customerToken}` },
      responseType: 'stream'
    });
    const previewFilePath = path.join(__dirname, 'test-assets', 'commission_preview.mp3');
    const writer = fs.createWriteStream(previewFilePath);
    previewRes.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    console.log('Preview track downloaded to:', previewFilePath);
  } else {
    console.warn('No preview track URL returned!');
  }

  // 6. Customer cancels the commission (should trigger refund, only allowed during preview phase)
  try {
    const cancelRes = await axios.post(`${BASE_URL}/commission/cancel`, {
      commissionId,
      reason: 'I changed my mind about the commission.'
    }, { headers: { Authorization: `Bearer ${customerToken}` } });
    console.log('Cancel commission response:', cancelRes.data);
  } catch (err) {
    console.error('Error cancelling commission:', err.response ? err.response.data : err);
  }

  // 7. Try to download finished commission after cancellation (should fail)
  try {
    await axios.get(`${BASE_URL}/commission/finished-commission`, {
      params: { commissionId },
      headers: { Authorization: `Bearer ${customerToken}` },
      responseType: 'stream'
    });
    console.error('ERROR: Was able to download finished commission after cancellation!');
  } catch (err) {
    console.log('As expected, cannot download finished commission after cancellation:', err.response ? err.response.data : err);
  }

  // At the end of the script, after all DB operations
  await mongoose.disconnect();

  // Output for manual verification
  console.log("\n--- Commission Cancel/Refund Flow Test Complete ---");
  console.log("Commission ID:", commissionId);
  console.log("Customer Token:", customerToken);
  console.log("Artist Token:", artistToken);
}

main().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
