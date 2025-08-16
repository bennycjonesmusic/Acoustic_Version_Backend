import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import CommissionRequest from './models/CommissionRequest.js'; // Adjust the path as necessary
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
const BASE_URL = 'http://localhost:3000';

const CUSTOMER_EMAIL = 'acousticversionuk@gmail.com';
const CUSTOMER_PASSWORD = 'test-customer-password-123'; 
const ARTIST_EMAIL = 'sarahandbenduo@gmail.com';
const ARTIST_PASSWORD = 'test-artist-password-123';

async function login(email, password) {

    const response = await axios.post(`${BASE_URL}/auth/login`, {
        login: email,
        password: password,
    });
    console.log(response.data); //check what the data is for debugging purposes

    if (!response.data.token) {

        throw new Error('Login failed, no token returned' + response.data.error || '');
    }
    return response.data.token;

    
    



}

async function main() {
  // Connect to MongoDB before any Mongoose model usage
  await mongoose.connect(process.env.MONGODB_URI);

  // Clear CommissionRequest collection before running test
  await CommissionRequest.deleteMany({});
  console.log('Cleared CommissionRequest collection.');

  // 0. Register customer and artist if not already present
  try {
    await axios.post(`${BASE_URL}/auth/register`, {
      username: 'CommissionCustomer',
      email: CUSTOMER_EMAIL,
      password: CUSTOMER_PASSWORD,
      about: 'Customer for commission test'
    });
    console.log('Customer registration attempted');
  } catch (e) { 
    console.log('Customer registration error:', e.response ? e.response.data : e);
  }
  try {
    await axios.post(`${BASE_URL}/auth/register`, {
      username: 'CommissionArtist',
      email: ARTIST_EMAIL,
      password: ARTIST_PASSWORD,
      about: 'Artist for commission test'
    });
    console.log('Artist registration attempted');
  } catch (e) { 
    console.log('Artist registration error:', e.response ? e.response.data : e);
  }

  // --- Ensure admin user is deleted and re-registered for a clean test ---
  const ADMIN_EMAIL = 'admin@acousticversion.co.uk';
  const ADMIN_PASSWORD = 'test-admin-password-123';
  try {
    // Use the new test-only endpoint to delete the admin user, authenticating as acousticversionuk@gmail.com (who is an admin)
    const adminToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
    console.log('Admin token for delete:', adminToken);
    await axios.post(`${BASE_URL}/admin/test-delete-user`, { email: ADMIN_EMAIL }, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('Deleted existing admin user (if present)');
  } catch (e) {
    // Ignore errors if user doesn't exist or route is not enabled
    console.log('Admin user delete step (ignore errors if not present):', e.response ? e.response.data : e);
  }

  // 1. Login as customer and artist
  let customerToken, artistToken;
  try {
    customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
    console.log('Customer token:', customerToken);
  } catch (e) {
    console.log('Customer login error:', e.response ? e.response.data : e);
    throw e;
  }
  try {
    artistToken = await login(ARTIST_EMAIL, ARTIST_PASSWORD);
    console.log('Artist token:', artistToken);
    // Set Stripe account for artist directly in DB (test only)
    const UserModel = (await import('./models/User.js')).default;
    await UserModel.findOneAndUpdate({ email: ARTIST_EMAIL }, { stripeAccountId: 'acct_1RTB1bCRMWHPkR1y' });
    console.log('Set artist Stripe accountId for test (direct DB update)');
  } catch (e) {
    console.log('Artist login error:', e.response ? e.response.data : e);
    throw e;
  }

  // 2. Get artist userId
  let artistRes, artistId;
  try {
    artistRes = await axios.get(`${BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${artistToken}` }
    });
    // Try to extract id from multiple possible locations.. likely to be in user
    artistId = artistRes.data.id || artistRes.data._id || (artistRes.data.user && (artistRes.data.user.id || artistRes.data.user._id));
    console.log('Artist userId:', artistId, 'Artist response:', artistRes.data);
  } catch (e) {
    console.log('Error fetching artist userId:', e.response ? e.response.data : e);
    throw e;
  }

  // 2b. Set artist commissionPrice to £10
  try {
    const setPriceRes = await axios.patch(`${BASE_URL}/users/profile`, {
      commissionPrice: 10
    }, {
      headers: { Authorization: `Bearer ${artistToken}` }
    });
    console.log('Set artist commissionPrice to £10:', setPriceRes.data);
    // Test: customerCommissionPrice should be 11.5 (10 + 1.5)
    if (!setPriceRes.data.user || setPriceRes.data.user.customerCommissionPrice !== 11.5) {
      throw new Error('customerCommissionPrice should be 11.5 when commissionPrice is 10, got: ' + (setPriceRes.data.user && setPriceRes.data.user.customerCommissionPrice));
    }
    console.log('Verified: customerCommissionPrice is correct:', setPriceRes.data.user.customerCommissionPrice);
  } catch (e) {
    console.log('Error setting artist commissionPrice:', e.response ? e.response.data : e);
    throw e;
  }

  // Approve the artist before commission request (ensure profileStatus is 'approved')
  // 2c. Login as admin and approve artist
  // NOTE: Make sure 'admin@acousticversion.co.uk' is present in utils/admins.js for admin registration to work!
  try {
    // Register admin if not present
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        username: 'TestAdmin',
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        about: 'Admin for commission test',
        role: 'admin'
      });
    } catch (e) { /* Ignore if already exists */ }
    const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    await axios.post(`${BASE_URL}/admin/approve-artist/${artistId}`, {}, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    console.log('Artist approved via admin endpoint');
  } catch (e) {
    console.warn('Artist approval step failed (may already be approved):', e.response ? e.response.data : e);
    console.warn('If you see an error about admin privileges, ensure the admin email is present in utils/admins.js');
  }

  // 3. Create a commission request as customer
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
  // Log and assert price breakdown for transparency
  console.log("Commission request response:", commissionReq.data);
  console.log("Commission price breakdown:", commissionReq.data);
  if (commissionReq.data.artistPrice !== 10) throw new Error('artistPrice should be 10');
  if (commissionReq.data.platformCommission !== 1.5) throw new Error('platformCommission should be 1.5');
  if (commissionReq.data.finalPrice !== 11.5) throw new Error('finalPrice should be 11.5');
  // Try to extract commissionId from multiple possible fields
  const commissionId = commissionReq.data.commissionId || commissionReq.data._id || commissionReq.data.id;
  console.log("Commission request created:", commissionId);

  // 3b. Artist accepts the commission (new flow)
  const acceptRes = await axios.post(`${BASE_URL}/commission/artist/respond`, {
    commissionId,
    action: 'accept'
  }, {
    headers: { Authorization: `Bearer ${artistToken}` }
  });
  console.log('Artist accepted commission:', acceptRes.data);

  // 3c. Customer pays for the commission (Stripe Checkout session)
  console.log('[TEST] About to trigger Stripe Checkout/payment for commission:', commissionId);
  const paymentSessionRes = await axios.post(`${BASE_URL}/commission/pay`, { commissionId }, {
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

  // 3d. Get all commissions for the artist using the new route
  const commissionsRes = await axios.get(`${BASE_URL}/commission/artist/commissions`, {
    headers: { Authorization: `Bearer ${artistToken}` }
  });
  console.log('Artist commissions:', commissionsRes.data.commissions);
  // Use the first commission's ID (should be the one just created)
  const commissionFromList = commissionsRes.data.commissions.find(c => c._id === commissionId) || commissionsRes.data.commissions[0];
  const commissionIdToApprove = commissionFromList._id;

  // --- Test: Get all commissions for the customer using the new paginated route ---
  const customerCommissionsRes = await axios.get(`${BASE_URL}/commission/customer/commissions`, {
    headers: { Authorization: `Bearer ${customerToken}` },
    params: { page: 1, limit: 10 }
  });
  console.log('Customer commissions (paginated):', customerCommissionsRes.data.commissions);
  console.log('Customer commissions pagination info:', {
    page: customerCommissionsRes.data.page,
    limit: customerCommissionsRes.data.limit,
    total: customerCommissionsRes.data.total,
    totalPages: customerCommissionsRes.data.totalPages
  });
  if (!Array.isArray(customerCommissionsRes.data.commissions) || customerCommissionsRes.data.commissions.length === 0) {
    throw new Error('Customer commissions route did not return any commissions!');
  }

  // 3c. Artist can also approve/deny using the new explicit endpoint
  // Approve (accept) the commission
  // SKIP this step after payment: artist should not approve/deny again after payment
  // const approveRes = await axios.post(`${BASE_URL}/commission/artist/approve-deny`, {
  //   commissionId: commissionIdToApprove,
  //   action: 'approve'
  // }, {
  //   headers: { Authorization: `Bearer ${artistToken}` }
  // });
  // console.log('Artist approved commission via /artist/approve-deny:', approveRes.data);

  // 4. Upload a finished track as artist for the commission (use commission endpoint, not tracks)
  const form = new FormData();
  form.append('commissionId', commissionId);
  // Only the file is required for /commission/upload-finished, but you can add more fields if needed
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
    // Use the new explicit preview endpoint
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

  // 6. Customer approves the finished track
  const approveRes = await axios.post(`${BASE_URL}/commission/confirm`, {
    commissionId,
    action: 'approve'
  }, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  console.log('Customer approved the finished track:', approveRes.data);

  // 6b. Customer triggers payout to artist (must be done after approval)
  const payoutRes = await axios.post(`${BASE_URL}/commission/approve-and-payout`, {
    commissionId
  }, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  console.log('Payout triggered:', payoutRes.data);

  // 7. Verify commission status after approval and payout
  try {
    const commissionStatusRes = await axios.get(`${BASE_URL}/commission/${commissionId}`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    console.log('Commission after approval:', commissionStatusRes.data);
    // Check if platform fee logic should be applied
    const expectedPlatformFee = Math.round(10 * 100 * 0.15); // 15% of £10
    const expectedArtistAmount = Math.round(10 * 100) - expectedPlatformFee;
    console.log(`Expected platform fee: £${(expectedPlatformFee/100).toFixed(2)}, expected artist payout: £${(expectedArtistAmount/100).toFixed(2)}`);
    console.log('NOTE: Check your Stripe dashboard for actual payout and platform balance.');
  } catch (err) {
    console.error('Error fetching commission after approval:', err.response ? err.response.data : err);
  }

  // 8. Customer downloads the finished commission after approval/payout
  try {
    const finishedRes = await axios.get(`${BASE_URL}/commission/finished-commission`, {
      params: { commissionId },
      headers: { Authorization: `Bearer ${customerToken}` },
      responseType: 'stream'
    });
    const finishedFilePath = path.join(__dirname, 'test-assets', 'commission_finished.mp3');
    const writer = fs.createWriteStream(finishedFilePath);
    finishedRes.data.pipe(writer);
    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
    console.log('Finished commission downloaded to:', finishedFilePath);
  } catch (err) {
    console.error('Error downloading finished commission:', err.response ? err.response.data : err);
  }

  // Client leaves a review for the artist after commission is complete
  try {
    const reviewRes = await axios.post(`${BASE_URL}/users/review/${artistId}`, {
      review: 'Great commission experience! Highly recommended.'
    }, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    console.log('Client review response:', reviewRes.data);
  } catch (err) {
    console.error('Error leaving review for artist:', err.response ? err.response.data : err);
  }

  // Query all tracks for the artist and print their averageRating and ratings
  const BackingTrack = (await import('./models/backing_track.js')).default;
  const artistTracks = await BackingTrack.find({ user: artistId });
  console.log('\n--- Artist Tracks and Ratings ---');
  artistTracks.forEach(track => {
    console.log(`Track: ${track.title} | averageRating: ${track.averageRating} | ratings:`, track.ratings);
  });
  console.log('---------------------------------\n');

  // Query all tracks for the admin and print their averageRating and ratings
  const adminId = (await (await import('./models/User.js')).default.findOne({ email: ADMIN_EMAIL }))._id;
  const adminTracks = await BackingTrack.find({ user: adminId });
  console.log('\n--- Admin Tracks and Ratings ---');
  adminTracks.forEach(track => {
    console.log(`Track: ${track.title} | averageRating: ${track.averageRating} | ratings:`, track.ratings);
  });
  console.log('---------------------------------\n');

  // 10. Output for manual verification
  console.log("\n--- Commission Flow Test Complete ---");
  console.log("Commission ID:", commissionId);
  console.log("Artist ID:", artistId);
  console.log("Customer Token:", customerToken);
  console.log("Artist Token:", artistToken);
  console.log("\nCheck your database and Stripe dashboard to verify commission payout and track ownership.");

  // 11. Output artist commission price and customer commission price for Stripe comparison
  try {
    // Fetch artist from API
    const artistApiRes = await axios.get(`${BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${artistToken}` }
    });
    const apiUser = artistApiRes.data.user || artistApiRes.data;
    console.log('\n--- Artist API values ---');
    console.log('API commissionPrice:', apiUser.commissionPrice);
    console.log('API customerCommissionPrice:', apiUser.customerCommissionPrice);
    // Fetch artist from DB (direct)
    const UserModel = (await import('./models/User.js')).default;
    const dbUser = await UserModel.findById(artistId);
    console.log('\n--- Artist DB values ---');
    console.log('DB commissionPrice:', dbUser.commissionPrice);
    console.log('DB customerCommissionPrice:', dbUser.customerCommissionPrice);
    console.log('-------------------------\n');
  } catch (err) {
    console.error('Error fetching artist commission prices for Stripe comparison:', err.response ? err.response.data : err);
  }

  // At the end of the script, after all DB operations
  await mongoose.disconnect();
}

main().catch(err => {
  console.error("Test failed:", err.response ? err.response.data : err);
  process.exit(1);
});

