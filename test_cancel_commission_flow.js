// test_cancel_commission_flow.js
// Test script for commission cancellation and refund
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3001';
const CUSTOMER_EMAIL = 'canceltestcustomer@example.com';
const CUSTOMER_PASSWORD = 'TestPassword123!';
const ARTIST_EMAIL = 'canceltestartist@example.com';
const ARTIST_PASSWORD = 'TestPassword123!';

async function login(email, password) {
  const res = await axios.post(`${BASE_URL}/auth/login`, { login: email, password });
  return res.data.token;
}

async function main() {
  // Register customer and artist
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
      about: 'Artist for cancel test'
    });
  } catch {}

  // Login
  const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  const artistToken = await login(ARTIST_EMAIL, ARTIST_PASSWORD);

  // Set artist commissionPrice
  await axios.patch(`${BASE_URL}/auth/update-profile`, { commissionPrice: 10 }, {
    headers: { Authorization: `Bearer ${artistToken}` }
  });

  // Approve artist (assume admin endpoint exists)
  try {
    const adminToken = await login('admin@acousticversion.co.uk', 'Moobslikejabba123456');
    const artistRes = await axios.get(`${BASE_URL}/users/me`, { headers: { Authorization: `Bearer ${artistToken}` } });
    const artistId = artistRes.data.id || artistRes.data._id;
    await axios.post(`${BASE_URL}/admin/approve-artist/${artistId}`, {}, { headers: { Authorization: `Bearer ${adminToken}` } });
  } catch {}

  // Create commission request
  const commissionReq = await axios.post(`${BASE_URL}/commission/request`, {
    artist: (await axios.get(`${BASE_URL}/users/me`, { headers: { Authorization: `Bearer ${artistToken}` } })).data.id,
    requirements: 'Test commission for cancellation',
    price: 10
  }, { headers: { Authorization: `Bearer ${customerToken}` } });
  const commissionId = commissionReq.data.commissionId || commissionReq.data._id;

  // Artist accepts
  await axios.post(`${BASE_URL}/commission/artist/respond`, {
    commissionId,
    action: 'accept'
  }, { headers: { Authorization: `Bearer ${artistToken}` } });

  // Customer pays
  const paymentSessionRes = await axios.post(`${BASE_URL}/commission/pay`, { commissionId }, { headers: { Authorization: `Bearer ${customerToken}` } });
  const paymentCheckoutUrl = paymentSessionRes.data.sessionUrl || (paymentSessionRes.data.sessionId && `https://checkout.stripe.com/pay/${paymentSessionRes.data.sessionId}`);
  if (paymentCheckoutUrl) {
    console.log("\n--- ACTION REQUIRED ---");
    console.log("Open this Stripe Checkout URL in your browser and complete the payment:");
    console.log(paymentCheckoutUrl);
    console.log("----------------------\n");
    const readline = (await import('readline')).default;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => rl.question('Press Enter after completing payment in Stripe Checkout...', () => { rl.close(); resolve(); }));
  }

  // Customer cancels commission (should trigger refund)
  try {
    const cancelRes = await axios.post(`${BASE_URL}/commission/cancel`, {
      commissionId,
      reason: 'I changed my mind about the commission.'
    }, { headers: { Authorization: `Bearer ${customerToken}` } });
    console.log('Cancel commission response:', cancelRes.data);
  } catch (err) {
    console.error('Error cancelling commission:', err.response ? err.response.data : err);
  }
}

main().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
