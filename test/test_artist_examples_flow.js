// test_artist_examples_flow.mocha.js
// Node.js script for artist example upload, fetch, and delete using axios and real HTTP requests
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import User from './models/User.js';

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = `artist@example.com`;
const TEST_PASSWORD = 'test-password-123'; 
const ADMIN_EMAIL = 'acousticversionuk@gmail.com';
    const ADMIN_PASSWORD = 'test-admin-password-123';

const CUSTOMER_EMAIL = "sarahandbenduo@gmail.com";
const CUSTOMER_PASSWORD = "test-customer-password-123";
let artistToken, artistId, exampleId, customerId, adminUploadedTrackId, artistUploadedTrackId, adminToken;

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
  try {
    await mongoose.connect(process.env.MONGODB_URI);
     console.log('Connected to MongoDB');
   
    
    // Clean up both artist and customer test users before running test (case-insensitive)
  
    await User.deleteMany({ email: { $regex: new RegExp('^' + CUSTOMER_EMAIL + '$', 'i') } });
    // Double-check deletion
    const artistExists = await User.findOne({ email: { $regex: new RegExp('^' + TEST_EMAIL + '$', 'i') } });
    const customerExists = await User.findOne({ email: { $regex: new RegExp('^' + CUSTOMER_EMAIL + '$', 'i') } });
    console.log('Artist exists after delete?', !!artistExists);
    console.log('Customer exists after delete?', !!customerExists);

    // Register artist
    let artistUser;
   
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        username: 'CommissionArtist',
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        role: 'artist',
        about: 'Artist for commission test'
      });
    } catch (err) {
      console.error('Artist already exists, skipping.', err.response ? err.response.data : err);
    }
    // Always approve and set Stripe account for artist if exists
    const adminTokenForApproval = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    artistUser = await User.findOne({ email: { $regex: new RegExp('^' + TEST_EMAIL + '$', 'i') } });
    if (artistUser) {
      await axios.post(
        `${BASE_URL}/admin/approve-artist/${artistUser._id}`,
        {},
        { headers: { Authorization: `Bearer ${adminTokenForApproval}` } }
      );
      await User.updateOne(
        { _id: artistUser._id },
        { $set: { stripeAccountId: 'acct_1RTB1bCRMWHPkR1y' } }
      );
      const updatedArtist = await User.findById(artistUser._id);
      console.log('CommissionArtist stripeAccountId:', updatedArtist.stripeAccountId);
    }

    // Register customer
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        username: 'CommissionCustomer',
        email: CUSTOMER_EMAIL,
        password: CUSTOMER_PASSWORD,
        role: 'user',
        about: 'Customer for commission test'
      });
    } catch (err) {
      console.error('Customer already exists, skipping.', err.response ? err.response.data : err);
    }

      

    

    const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
    artistToken = await login(TEST_EMAIL, TEST_PASSWORD);

    // --- TEST: Update artist avatar ---
    const avatarPath = path.join(__dirname, 'test-assets', 'ottopic.jpg');
    const avatarForm = new FormData();
    avatarForm.append('avatar', fs.createReadStream(avatarPath));
    const avatarRes = await axios.patch(
      `${BASE_URL}/users/profile`,
      avatarForm,
      {
        headers: {
          ...avatarForm.getHeaders(),
          Authorization: `Bearer ${artistToken}`
        }
      }
    );
    console.log('Artist avatar update response:', avatarRes.data);
    if (!avatarRes.data.user || !avatarRes.data.user.avatar) {
      throw new Error('Avatar not set after upload');
    }
    // --- TEST: Remove artist avatar ---
    const removeAvatarRes = await axios.patch(
      `${BASE_URL}/users/profile`,
      { avatar: '' },
      { headers: { Authorization: `Bearer ${artistToken}` } }
    );
    console.log('Artist avatar remove response:', removeAvatarRes.data);
    if (removeAvatarRes.data.user && removeAvatarRes.data.user.avatar) {
      throw new Error('Avatar not removed after setting to empty string');
    }

    
   
    const myRes = await axios.get(`${BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${artistToken}` }

    });

    const cusRes = await axios.get(`${BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${customerToken}` }

    });
   
    //get both customer and artist IDS
    customerId = cusRes.data.id || cusRes.data._id || (cusRes.data.user && (cusRes.data.user.id || cusRes.data.user._id)); //ensure it is correct
    artistId = myRes.data.id || myRes.data._id || (myRes.data.user && (myRes.data.user.id || myRes.data.user._id)); //ensure it is correct

    // Admin login
   
    adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

    // Fetch admin's user ID for use in review/reviews routes
    const adminRes = await axios.get(`${BASE_URL}/users/me`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminId = adminRes.data.id || adminRes.data._id || (adminRes.data.user && (adminRes.data.user.id || adminRes.data.user._id));

    // Admin uploads a track (sample.mp3) with same logic as artist
    const filePath = path.join(__dirname, 'test-assets', 'sample.mp3');
    const adminTrackForm = new FormData();
    adminTrackForm.append('file', fs.createReadStream(filePath));
    adminTrackForm.append('title', 'Admin Test Track');
    adminTrackForm.append('price', '10'); // Set price to 10 for Stripe test
    adminTrackForm.append('description', 'Admin test track upload');
    adminTrackForm.append('originalArtist', 'Admin Original Artist');
    adminTrackForm.append('backingTrackType', 'Piano');
    adminTrackForm.append('genre', 'Classical');
    adminTrackForm.append('vocalRange', 'Baritone');
    // Add all fields the artist upload uses
    adminTrackForm.append('instructions', '');
    adminTrackForm.append('youtubeGuideUrl', '');
    adminTrackForm.append('guideTrackUrl', '');
    const adminUploadRes = await axios.post(
      `${BASE_URL}/tracks/upload`,
      adminTrackForm,
      {
        headers: {
          ...adminTrackForm.getHeaders(),
          Authorization: `Bearer ${adminToken}`
        }
      }
    );
    console.log('Admin track upload response:', adminUploadRes.data);
    const adminUploadedTrack = adminUploadRes.data.track;
    adminUploadedTrackId = adminUploadedTrack._id || adminUploadedTrack.id;
    if (!adminUploadedTrack || !adminUploadedTrackId || !adminUploadedTrack.fileUrl || !adminUploadedTrack.previewUrl) {
      throw new Error('Admin track upload failed: missing _id/id, fileUrl, or previewUrl');
    }
    if (adminUploadRes.data.previewError) {
      throw new Error('Admin track upload preview failed: ' + adminUploadRes.data.previewError);
    }

    // Debug: Check if track exists in DB immediately after upload
    const TrackModel = (await import('./models/backing_track.js')).default;
    const trackInDbAfterUpload = await TrackModel.findById(adminUploadedTrackId);
    console.log('Track in DB after upload:', trackInDbAfterUpload ? trackInDbAfterUpload.toObject() : null);

    // --- STRIPE PURCHASE TEST ---
    // Customer creates Stripe Checkout session for admin's track
    const stripeCheckoutRes = await axios.post(
      `${BASE_URL}/stripe/create-checkout-session`,
      { trackId: adminUploadedTrackId },
      { headers: { Authorization: `Bearer ${customerToken}` } }
    );
    console.log('Stripe Checkout session response:', stripeCheckoutRes.data);
    if (!stripeCheckoutRes.data.url) {
      throw new Error('Stripe Checkout session creation failed: no url returned');
    }
    console.log('\n--- ACTION REQUIRED ---');
    console.log('Open this Stripe Checkout URL in your browser and complete the payment:');
    console.log(stripeCheckoutRes.data.url);
    console.log('----------------------\n');
    // Wait for user to complete payment
    const readline = (await import('readline')).default;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => rl.question('Press Enter after completing payment in Stripe Checkout...', () => { rl.close(); resolve(); }));
    
    // After payment, customer should have access to the track
    // Wait for Stripe webhook to process purchase (retry up to 5 times, 2s apart)
    let purchasedTrack;
    for (let attempt = 0; attempt < 5; attempt++) {
      const customerTracksRes = await axios.get(
        `${BASE_URL}/tracks/purchased-tracks`,
        { headers: { Authorization: `Bearer ${customerToken}` } }
      );
      // Debug: log the full structure for troubleshooting
      console.log('Customer purchased tracks raw:', customerTracksRes.data.tracks || customerTracksRes.data.purchasedTracks);
      console.log(`Customer tracks after purchase (attempt ${attempt + 1}):`, customerTracksRes.data);
      const purchasedTrackObj = (customerTracksRes.data.tracks || customerTracksRes.data.purchasedTracks || []).find(
        pt => pt.track && (pt.track.id === adminUploadedTrackId || pt.track._id === adminUploadedTrackId || pt.track.id?.toString() === adminUploadedTrackId || pt.track._id?.toString() === adminUploadedTrackId)
      );
      purchasedTrack = purchasedTrackObj && purchasedTrackObj.track;
      if (purchasedTrack) break;
      // Wait 2 seconds before retrying
      await new Promise(res => setTimeout(res, 2000));
    }
    if (!purchasedTrack) {
      throw new Error('Track not found in customer\'s purchased tracks after payment (after waiting for webhook)');
    }
    console.log('Purchased track details:', purchasedTrack);

    // Debug: Check if track exists in DB right before GET /tracks/:id
    const trackInDbBeforeGet = await TrackModel.findById(adminUploadedTrackId);
    console.log('Track in DB before GET /tracks/:id:', trackInDbBeforeGet ? trackInDbBeforeGet.toObject() : null);

    // After confirming purchasedTrack, fetch the track details and assert that purchaseCount is 1 after purchase.
    const trackDetailsRes = await axios.get(
      `${BASE_URL}/public/tracks/${adminUploadedTrackId}`
    );
    console.log('Track details after purchase:', trackDetailsRes.data);
    console.log('Track details after purchase:', trackDetailsRes.data);
    // Accept both .purchaseCount and .track.purchaseCount (depending on API response shape)
    const purchaseCount = trackDetailsRes.data.purchaseCount !== undefined
      ? trackDetailsRes.data.purchaseCount
      : (trackDetailsRes.data.track && trackDetailsRes.data.track.purchaseCount);
    if (purchaseCount !== 1) {
      throw new Error(`Expected purchaseCount to be 1 after purchase, got ${purchaseCount}`);
    }
    console.log('Purchase count after purchase:', purchaseCount);

    // Artist fetches their own track (should be accessible)
    // Use /tracks/uploaded-tracks for admin (artist) to see purchaseCount
    const artistTracksRes = await axios.get(
      `${BASE_URL}/tracks/uploaded-tracks`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    console.log('Admin uploaded tracks:', artistTracksRes.data);
    const adminUploadedTrackObj = (artistTracksRes.data.tracks || []).find(
      t => t.id === adminUploadedTrackId || t._id === adminUploadedTrackId
    );
    if (!adminUploadedTrackObj) {
      throw new Error('Admin uploaded track not found in uploaded-tracks after purchase');
    }
    if (adminUploadedTrackObj.purchaseCount !== 1) {
      throw new Error(`Expected admin uploaded track purchaseCount to be 1, got ${adminUploadedTrackObj.purchaseCount}`);
    }
    console.log('Admin uploaded track purchaseCount after purchase:', adminUploadedTrackObj.purchaseCount);

    // --- ADMIN APPROVES ARTIST BEFORE ARTIST UPLOADS ---
    // Approve the artist so they can upload tracks (required by business logic)
    console.log('Before admin approves artist');
    try {
      const approveRes = await axios.post(
        `${BASE_URL}/admin/approve-artist/${artistId}`,
        {},
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      console.log('Artist approved by admin:', approveRes.data);
    } catch (err) {
      console.error('Error approving artist (may already be approved):', err.response ? err.response.data : err);
    }
    console.log('After admin approves artist');
    // Debug marker: check if we reach artist upload
    console.log('Reached artist upload');

    // --- ARTIST SUBSCRIBES TO PRO TIER (Stripe) ---
    // Create Stripe Checkout session for artist subscription upgrade
    let proCheckoutUrl;
    try {
      const proCheckoutRes = await axios.post(
        `${BASE_URL}/stripe-subscriptions/create-subscription-session`,
        { tier: 'pro' },
        { headers: { Authorization: `Bearer ${artistToken}` } }
      );
      proCheckoutUrl = proCheckoutRes.data.url;
      if (!proCheckoutUrl) throw new Error('No Stripe Checkout URL returned for pro subscription');
      console.log('\n--- ACTION REQUIRED ---');
      console.log('Open this Stripe Checkout URL in your browser and complete the artist PRO subscription payment:');
      console.log(proCheckoutUrl);
      console.log('----------------------\n');
      // Wait for user to complete payment
      const readline = (await import('readline')).default;
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      await new Promise(resolve => rl.question('Press Enter after completing PRO subscription payment in Stripe Checkout...', () => { rl.close(); resolve(); }));
    } catch (err) {
      console.error('Error creating Stripe subscription session:', err.response ? err.response.data : err);
      throw err;
    }
    // Wait for Stripe webhook to process subscription (retry up to 5 times, 2s apart)
    let artistSubTier = 'free';
    for (let attempt = 0; attempt < 5; attempt++) {
      const artistProfile = await axios.get(
        `${BASE_URL}/users/me`,
        { headers: { Authorization: `Bearer ${artistToken}` } }
      );
      artistSubTier = artistProfile.data.subscriptionTier || (artistProfile.data.user && artistProfile.data.user.subscriptionTier);
      console.log(`Artist subscriptionTier after upgrade (attempt ${attempt + 1}):`, artistSubTier);
      if (artistSubTier === 'pro') break;
      await new Promise(res => setTimeout(res, 2000));
    }
    if (artistSubTier !== 'pro') {
      throw new Error('Artist subscriptionTier not updated to pro after Stripe payment');
    }
    console.log('Artist successfully upgraded to PRO tier.');

    // --- ARTIST UPLOADS A TRACK (for artist track access test) ---
    const artistTrackForm = new FormData();
    artistTrackForm.append('file', fs.createReadStream(filePath));
    artistTrackForm.append('title', 'Artist Test Track');
    artistTrackForm.append('price', '12');
    artistTrackForm.append('description', 'Artist test track upload');
    artistTrackForm.append('originalArtist', 'Artist Original');
    artistTrackForm.append('backingTrackType', 'Acoustic Guitar');
    artistTrackForm.append('genre', 'Folk');
    artistTrackForm.append('vocalRange', 'Tenor');
    // Add all fields the admin upload uses
    artistTrackForm.append('instructions', '');
    artistTrackForm.append('youtubeGuideUrl', '');
    artistTrackForm.append('guideTrackUrl', '');
    let artistUploadRes, artistUploadedTrack;
    try {
      artistUploadRes = await axios.post(
        `${BASE_URL}/tracks/upload`,
        artistTrackForm,
        {
          headers: {
            ...artistTrackForm.getHeaders(),
            Authorization: `Bearer ${artistToken}`
          }
        }
      );
      console.log('Artist track upload response:', artistUploadRes.data);
      artistUploadedTrack = artistUploadRes.data.track;
    } catch (err) {
      if (err.response) {
        console.error('Artist track upload failed:', {
          status: err.response.status,
          data: err.response.data,
          headers: err.response.headers
        });
      } else {
        console.error('Artist track upload failed:', err.stack || err);
      }
      throw err;
    }
    artistUploadedTrackId = artistUploadedTrack && (artistUploadedTrack._id || artistUploadedTrack.id);
    if (!artistUploadedTrack || !artistUploadedTrackId || !artistUploadedTrack.fileUrl || !artistUploadedTrack.previewUrl) {
      console.error('Full artist upload response:', artistUploadRes && artistUploadRes.data);
      throw new Error('Artist track upload failed: missing _id/id, fileUrl, or previewUrl');
    }
    if (artistUploadRes.data.previewError) {
      throw new Error('Artist track upload preview failed: ' + artistUploadRes.data.previewError);
    }

    // --- ASSERT ARTIST STORAGE UPDATED AFTER UPLOAD ---
    // Get file size of uploaded file
    const uploadedFileStats = fs.statSync(filePath);
    const uploadedFileSize = uploadedFileStats.size;
    // Fetch artist profile
    const artistProfileAfterUpload = await axios.get(
      `${BASE_URL}/users/me`,
      { headers: { Authorization: `Bearer ${artistToken}` } }
    );
    const storageUsed = artistProfileAfterUpload.data.storageUsed || (artistProfileAfterUpload.data.user && artistProfileAfterUpload.data.user.storageUsed);
    console.log('Artist storageUsed after upload:', storageUsed, 'uploaded file size:', uploadedFileSize);
    if (!storageUsed || storageUsed < uploadedFileSize) {
      throw new Error(`Artist storageUsed not updated correctly after upload. Expected at least ${uploadedFileSize}, got ${storageUsed}`);
    }
    console.log('Artist storageUsed successfully updated after upload.');
      const featuredRes = await axios.get(`${BASE_URL}/public/tracks/featured`);
    console.log('Featured tracks response:', featuredRes.data);
    // Accept both array and { featured: [...] } response shapes
    const featuredTracks = Array.isArray(featuredRes.data) ? featuredRes.data : featuredRes.data.featured;
    if (!Array.isArray(featuredTracks)) {
      throw new Error('Featured tracks response is not an array');
    }
    // Assert both admin and artist tracks are present in featured
    const adminTrackFound = featuredTracks.some(t => t._id === adminUploadedTrackId || t.id === adminUploadedTrackId);
    const artistTrackFound = featuredTracks.some(t => t._id === artistUploadedTrackId || t.id === artistUploadedTrackId);
    if (!adminTrackFound) {
      throw new Error('Admin uploaded track not found in featured tracks');
    }
    if (!artistTrackFound) {
      throw new Error('Artist uploaded track not found in featured tracks');
    }
    console.log('All featured tracks:', JSON.stringify(featuredTracks, null, 2));

    // --- TEST: Featured artists endpoint ---
    const featuredArtistsRes = await axios.get(`${BASE_URL}/public/artists/featured`);
    console.log('Featured artists response:', featuredArtistsRes.data);
    const featuredArtists = Array.isArray(featuredArtistsRes.data) ? featuredArtistsRes.data : featuredArtistsRes.data.featured;
    if (!Array.isArray(featuredArtists)) {
      throw new Error('Featured artists response is not an array');
    }
    // Assert that at least one artist is present (should include the test artist)
    const testArtistFound = featuredArtists.some(a => a._id === artistId || a.id === artistId);
    if (!testArtistFound) {
      throw new Error('Test artist not found in featured artists');
    }
    console.log('Featured artists test passed.');
    // --- TEST: Download purchased track (should succeed) ---
    let downloadRes;
    downloadRes = await axios.get(
      `${BASE_URL}/tracks/download/${adminUploadedTrackId}`,
      {
        headers: { Authorization: `Bearer ${customerToken}` },
        responseType: 'arraybuffer',
        validateStatus: null
      }
    );
    // --- ARTIST CANCELS PRO SUBSCRIPTION (Stripe) ---
    try {
      const cancelRes = await axios.post(
        `${BASE_URL}/stripe-subscriptions/cancel-subscription`,
        {},
        { headers: { Authorization: `Bearer ${artistToken}` } }
      );
      console.log('Artist subscription cancel response:', cancelRes.data);
    } catch (err) {
      console.error('Error cancelling artist subscription:', err.response ? err.response.data : err);
      throw err;
    }
    // Wait for Stripe webhook to process cancellation (retry up to 5 times, 2s apart)
    let artistSubTierAfterCancel = 'pro';
    for (let attempt = 0; attempt < 5; attempt++) {
      const artistProfile = await axios.get(
        `${BASE_URL}/users/me`,
        { headers: { Authorization: `Bearer ${artistToken}` } }
      );
      artistSubTierAfterCancel = artistProfile.data.subscriptionTier || (artistProfile.data.user && artistProfile.data.user.subscriptionTier);
      console.log(`Artist subscriptionTier after cancel (attempt ${attempt + 1}):`, artistSubTierAfterCancel);
      if (artistSubTierAfterCancel === 'free') break;
      await new Promise(res => setTimeout(res, 2000));
    }
    if (artistSubTierAfterCancel !== 'free') {
      throw new Error('Artist subscriptionTier not downgraded to free after cancellation');
    }
    console.log('Artist subscription successfully cancelled and downgraded to FREE tier.');

    // --- CUSTOMER PURCHASES ARTIST TRACK ---
    // Create Stripe Checkout session for customer's track purchase
    console.log('About to POST /stripe/create-checkout-session for artistUploadedTrackId:', artistUploadedTrackId);
    const customerStripeCheckoutRes = await axios.post(
      `${BASE_URL}/stripe/create-checkout-session`,
      { trackId: artistUploadedTrackId },
      { headers: { Authorization: `Bearer ${customerToken}` } }
    );
    console.log('Customer Stripe Checkout session response:', customerStripeCheckoutRes.data);
    if (!customerStripeCheckoutRes.data.url) {
      throw new Error('Customer Stripe Checkout session creation failed: no url returned');
    }
    console.log('\n--- ACTION REQUIRED ---');
    console.log('Open this Stripe Checkout URL in your browser and complete the payment:');
    console.log(customerStripeCheckoutRes.data.url);
    console.log('----------------------\n');
    // Wait for user to complete payment
    const customerRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise(resolve => customerRl.question('Press Enter after completing payment in Customer Stripe Checkout...', () => { customerRl.close(); resolve(); }));
    console.log('About to attempt download for artistUploadedTrackId:', artistUploadedTrackId);
    // --- TEST: Customer downloads purchased artist track ---
    // Wait for up to 5 attempts (2s apart) for track to become downloadable (handles webhook race condition)

    let lastDownloadError;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        downloadRes = await axios.get(
          `${BASE_URL}/tracks/download/${artistUploadedTrackId}`,
          {
            headers: { Authorization: `Bearer ${customerToken}` },
            responseType: 'arraybuffer',
            validateStatus: null
          }
        );
        if (downloadRes.status === 200) break;
        lastDownloadError = `Attempt ${attempt + 1}: status ${downloadRes.status}`;
      } catch (err) {
        lastDownloadError = `Attempt ${attempt + 1}: ${err.message}`;
      }
      await new Promise(res => setTimeout(res, 2000));
    }
    if (!downloadRes || downloadRes.status !== 200) {
      throw new Error(`Download failed for purchased track after retries. Last error: ${lastDownloadError}`);
    }
    console.log('Download status:', downloadRes.status);
    console.log('Download content-type:', downloadRes.headers['content-type']);
    console.log('First 32 bytes:', Buffer.from(downloadRes.data).toString('hex').slice(0, 64));
    if (!downloadRes.headers['content-type'] || !downloadRes.headers['content-type'].includes('audio')) {
      throw new Error('Downloaded file is not an audio file');
    }
    // Assert that the file is not empty
    if (!downloadRes.data || downloadRes.data.length < 1000) {
      throw new Error('Downloaded audio file is unexpectedly small or empty');
    }
    console.log('Audio file download test passed.');

    // --- TEST: Admin refunds the purchased track ---
    console.log('Refund debug: customerId =', customerId, 'adminUploadedTrackId =', adminUploadedTrackId, 'typeof customerId:', typeof customerId, 'typeof adminUploadedTrackId:', typeof adminUploadedTrackId);
    const refundRes = await axios.post(
      `${BASE_URL}/commission/admin/track-refund`,
      { userId: customerId, trackId: adminUploadedTrackId },
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    console.log('Refund response:', refundRes.data);
    if (!refundRes.data.success) {
      throw new Error('Refund failed: ' + JSON.stringify(refundRes.data));
    }

    // After refund, customer should no longer have access to the track
    const customerTracksAfterRefund = await axios.get(
      `${BASE_URL}/tracks/purchased-tracks`,
      { headers: { Authorization: `Bearer ${customerToken}` } }
    );
    const stillPurchased = (customerTracksAfterRefund.data.tracks || customerTracksAfterRefund.data.purchasedTracks || []).some(
      pt => pt.track && (pt.track.id === adminUploadedTrackId || pt.track._id === adminUploadedTrackId)
    );
    if (stillPurchased) {
      throw new Error('Track still present in customer purchased tracks after refund');
    }
    // Assert download is now denied after refund
    const deniedAfterRefund = await axios.get(
      `${BASE_URL}/tracks/download/${adminUploadedTrackId}`,
      {
        headers: { Authorization: `Bearer ${customerToken}` },
        responseType: 'arraybuffer',
        validateStatus: null
      }
    );
    if (deniedAfterRefund.status === 200) {
      throw new Error('Download succeeded for refunded track (should fail)');
    }
    console.log('Refund test passed: track removed from customer purchased tracks and download is denied.');

    // --- TEST: Download unpurchased track (should fail) ---
    // Register a new user who has not purchased any tracks
    const UNPURCHASED_EMAIL = 'unboughtuser@example.com';
    const UNPURCHASED_PASSWORD = 'UnboughtUser123!';
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        username: 'UnboughtUser',
        email: UNPURCHASED_EMAIL,
        password: UNPURCHASED_PASSWORD,
        role: 'user',
        about: 'User who has not purchased any tracks'
      });
    } catch (err) {
      // Ignore if already exists
    }
    const unboughtToken = await login(UNPURCHASED_EMAIL, UNPURCHASED_PASSWORD);
    const deniedRes = await axios.get(
      `${BASE_URL}/tracks/download/${artistUploadedTrackId}`,
      {
        headers: { Authorization: `Bearer ${unboughtToken}` },
        responseType: 'arraybuffer',
        validateStatus: null
      }
    );
    if (deniedRes.status === 200) {
      throw new Error('Download succeeded for unpurchased track (should fail)');
    }
    console.log('Unpurchased user denied download as expected.');
  } catch (err) {
    // Pause in debugger and print error if any error occurs before artist upload
    debugger;
    console.error('Error in test flow:', err.stack || err);
  } finally {
    // --- TEST: Delete uploaded tracks (admin and artist) ---
    // Delete admin's uploaded track
    try {
      const deleteAdminTrackRes = await axios.delete(
        `${BASE_URL}/tracks/${adminUploadedTrackId}`,
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      console.log('Admin track deleted:', deleteAdminTrackRes.data);
      // Optionally assert success
      if (deleteAdminTrackRes.status !== 200) {
        throw new Error('Failed to delete admin uploaded track');
      }
      // Try to fetch the track, should 404 or not exist
      try {
        await axios.get(`${BASE_URL}/public/tracks/${adminUploadedTrackId}`);
        throw new Error('Admin track still accessible after deletion');
      } catch (err) {
        if (!err.response || err.response.status !== 404) {
          throw new Error('Unexpected error when fetching deleted admin track: ' + (err.response ? err.response.status : err.message));
        }
        console.log('Confirmed admin track is not accessible after deletion.');
      }
    } catch (err) {
      console.error('Error deleting admin uploaded track:', err.stack || err);
    }
    // Delete artist's uploaded track
    try {
      if (!artistUploadedTrackId) {
        console.error('artistUploadedTrackId is not set, skipping artist track deletion.');
      } else {
        const TrackModel = (await import('./models/backing_track.js')).default;
        const artistTrack = await TrackModel.findById(artistUploadedTrackId);
        console.log('Artist track before delete:', artistTrack ? artistTrack.toObject() : null);
        const deleteArtistTrackRes = await axios.delete(
          `${BASE_URL}/tracks/${artistUploadedTrackId}`,
          { headers: { Authorization: `Bearer ${artistToken}` } }
        );
        console.log('Artist track deleted:', deleteArtistTrackRes.data);
        if (deleteArtistTrackRes.status !== 200) {
          throw new Error('Failed to delete artist uploaded track');
        }
        // Only expect 404 if the delete response does NOT indicate a soft delete
        if (
          !deleteArtistTrackRes.data.message ||
          !deleteArtistTrackRes.data.message.includes('marked as deleted')
        ) {
          try {
            await axios.get(`${BASE_URL}/public/tracks/${artistUploadedTrackId}`);
            throw new Error('Artist track still accessible after deletion');
          } catch (err) {
            if (!err.response || err.response.status !== 404) {
              throw new Error('Unexpected error when fetching deleted artist track: ' + (err.response ? err.response.status : err.message));
            }
            console.log('Confirmed artist track is not accessible after deletion.');
          }
        } else {
          console.log('Artist track soft-deleted (still accessible until all purchases are cleared).');
        }
      }
    } catch (err) {
      if (err.response) {
        console.error('Error deleting artist uploaded track:', {
          status: err.response.status,
          data: err.response.data,
          headers: err.response.headers
        });
      } else {
        console.error('Error deleting artist uploaded track:', err.stack || err);
      }
    }
    // Cleanup: Delete test users created during the test
    try {
  
      await User.deleteMany({ email: { $regex: new RegExp('^' + CUSTOMER_EMAIL + '$', 'i') } });
      console.log('Cleanup completed: test users deleted');
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr.stack || cleanupErr);
    }

    // --- TEST: Public endpoints: /tracks/search, /tracks/query, /users/search ---
    try {
      // /public/tracks/search
      const searchQuery = { query: 'Admin Test Track' }; // Use real track title to pass backend validation
      console.log('DEBUG: Sending /public/tracks/search with params:', searchQuery);
      const searchTracksRes = await axios.get(`${BASE_URL}/public/tracks/search`, {
        params: searchQuery,
        validateStatus: null
      });
      console.log('DEBUG: /public/tracks/search response:', {
        status: searchTracksRes.status,
        data: searchTracksRes.data
      });
      if (searchTracksRes.status !== 200) throw new Error('/public/tracks/search did not return 200');

      // /public/tracks/query
      const queryTracksRes = await axios.get(`${BASE_URL}/public/tracks/query`, {
        params: { page: 1, limit: 5 }, // adjust params as needed
        validateStatus: null
      });
      console.log('/public/tracks/query response:', queryTracksRes.status, queryTracksRes.data);
      if (queryTracksRes.status !== 200) throw new Error('/public/tracks/query did not return 200');

      // /public/users/search
      const searchUsersRes = await axios.get(`${BASE_URL}/public/users/search`, {
        params: { query: 'CommissionArtist' }, // Use correct param name and real username
        validateStatus: null
      });
      console.log('/public/users/search response:', searchUsersRes.status, searchUsersRes.data);
      if (searchUsersRes.status !== 200) throw new Error('/public/users/search did not return 200');
    } catch (err) {
      console.error('Error testing public endpoints:', err.stack || err);
      throw err;
    }
  }
}

// Connect to MongoDB before any Mongoose model usage


main();


// At the end of the script, after all DB operations