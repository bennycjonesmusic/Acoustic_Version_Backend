// test_artist_examples_flow.mocha.js
// Node.js script for artist example upload, fetch, and delete using axios and real HTTP requests
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import mongoose from 'mongoose';
import User from './models/User.js';

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = `artist@example.com`;
const TEST_PASSWORD = 'Moobslikejabba123456';

const CUSTOMER_EMAIL = "newcustomer@example.com";
const CUSTOMER_PASSWORD = "Moobslikejabba123456";
let artistToken, artistId, exampleId;

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
    await User.deleteMany({ email: { $regex: new RegExp('^' + TEST_EMAIL + '$', 'i') } });
    await User.deleteMany({ email: { $regex: new RegExp('^' + CUSTOMER_EMAIL + '$', 'i') } });
    // Double-check deletion
    const artistExists = await User.findOne({ email: { $regex: new RegExp('^' + TEST_EMAIL + '$', 'i') } });
    const customerExists = await User.findOne({ email: { $regex: new RegExp('^' + CUSTOMER_EMAIL + '$', 'i') } });
    console.log('Artist exists after delete?', !!artistExists);
    console.log('Customer exists after delete?', !!customerExists);

    // Register artist
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
    const artistToken = await login(TEST_EMAIL, TEST_PASSWORD);
    // Login to get token
   
    const myRes = await axios.get(`${BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${artistToken}` }

    });

    const cusRes = await axios.get(`${BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${customerToken}` }

    });
   
    //get both customer and artist IDS
    const customerId = cusRes.data.id || cusRes.data._id || (cusRes.data.user && (cusRes.data.user.id || cusRes.data.user._id)); //ensure it is correct
    const artistId = myRes.data.id || myRes.data._id || (myRes.data.user && (myRes.data.user.id || myRes.data.user._id)); //ensure it is correct

    // Admin login
    const ADMIN_EMAIL = 'acousticversionuk@gmail.com';
    const ADMIN_PASSWORD = 'Moobslikejabba123456';
    const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);

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
    const adminUploadedTrackId = adminUploadedTrack._id || adminUploadedTrack.id;
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
    const artistUploadRes = await axios.post(
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
    const artistUploadedTrack = artistUploadRes.data.track;
    const artistUploadedTrackId = artistUploadedTrack._id || artistUploadedTrack.id;
    if (!artistUploadedTrack || !artistUploadedTrackId || !artistUploadedTrack.fileUrl || !artistUploadedTrack.previewUrl) {
      throw new Error('Artist track upload failed: missing _id/id, fileUrl, or previewUrl');
    }
    if (artistUploadRes.data.previewError) {
      throw new Error('Artist track upload preview failed: ' + artistUploadRes.data.previewError);
    }
    try {
      // Customer follows artist
      const followRes = await axios.post(
        `${BASE_URL}/users/follow/${artistId}`,
        {},
        { headers: { Authorization: `Bearer ${customerToken}` } }
      );
      console.log('Customer followed artist:', followRes.data);
      // Verify artist's followers includes customer
      const artistAfterFollow = await axios.get(
        `${BASE_URL}/public/users/${artistId}`
      );
      if (!artistAfterFollow.data.followers || !artistAfterFollow.data.followers.includes(customerId)) {
        throw new Error('Customer not found in artist followers after follow');
      }
      // Verify customer's following includes artist
      const customerAfterFollow = await axios.get(
        `${BASE_URL}/public/users/${customerId}`
      );
      if (!customerAfterFollow.data.following || !customerAfterFollow.data.following.includes(artistId)) {
        throw new Error('Artist not found in customer following after follow');
      }
      // Customer unfollows artist
      const unfollowRes = await axios.post(
        `${BASE_URL}/users/unfollow/${artistId}`,
        {},
        { headers: { Authorization: `Bearer ${customerToken}` } }
      );
      console.log('Customer unfollowed artist:', unfollowRes.data);
      // Verify artist's followers does NOT include customer
      const artistAfterUnfollow = await axios.get(
        `${BASE_URL}/public/users/${artistId}`
      );
      if (artistAfterUnfollow.data.followers && artistAfterUnfollow.data.followers.includes(customerId)) {
        throw new Error('Customer still found in artist followers after unfollow');
      }
      // Verify customer's following does NOT include artist
      const customerAfterUnfollow = await axios.get(
        `${BASE_URL}/public/users/${customerId}`
      );
      if (customerAfterUnfollow.data.following && customerAfterUnfollow.data.following.includes(artistId)) {
        throw new Error('Artist still found in customer following after unfollow');
      }
      console.log('Follow/unfollow artist test passed.');
    } catch (followErr) {
      console.error('Error in follow/unfollow test:', followErr);
    }

    // Debug: Check if artist track exists in DB immediately after upload
    const artistTrackInDbAfterUpload = await TrackModel.findById(artistUploadedTrackId);
    console.log('Artist track in DB after upload:', artistTrackInDbAfterUpload ? artistTrackInDbAfterUpload.toObject() : null);
    //customer rates ADMINS track
    
    
    //review/rating/comment logic
    
    const rateTrack = await axios.post(`${BASE_URL}/tracks/rate/${adminUploadedTrackId}`, {rating: 5}, { headers: { Authorization: `Bearer ${customerToken}` } });

    console.log('Customer rated admin track:', rateTrack.data);  

    const leaveReview = await axios.post(`${BASE_URL}/users/review/${adminId}`, {review: "Great musician, very professional!"}, { headers: { Authorization: `Bearer ${customerToken}` } });
    
    console.log('Customer left review for admin:', leaveReview.data);

    // Comment on the admin's track
    const commentTrack = await axios.post(
      `${BASE_URL}/tracks/comment/${adminUploadedTrackId}`,
      { comment: "Love this track!" },
      { headers: { Authorization: `Bearer ${customerToken}` } }
    );
    console.log('Customer commented on admin track:', commentTrack.data);
    // Assert comment exists in response
    if (!commentTrack.data.comments || !commentTrack.data.comments.some(c => c.text === "Love this track!")) {
      throw new Error('Comment not found in response after creation');
    }

    // Confirm the comment exists on the track before deleting
    const trackWithComment = await axios.get(
      `${BASE_URL}/public/tracks/${adminUploadedTrackId}`
    );
    const commentsArray = trackWithComment.data.comments || (trackWithComment.data.track && trackWithComment.data.track.comments) || [];
    const lastCommentId = commentTrack.data.comments && commentTrack.data.comments.length > 0 ? commentTrack.data.comments[commentTrack.data.comments.length - 1]._id : null;
    const foundComment = commentsArray.find(c => c._id === lastCommentId);
    if (foundComment) {
      console.log('Confirmed comment exists on track before deletion:', foundComment);
    } else {
      throw new Error('Comment not found on track before deletion!');
    }

    // Delete the comment just made (by the same user)
    const commentId = lastCommentId;
    if (commentId) {
      const deleteCommentRes = await axios.delete(
        `${BASE_URL}/tracks/comment/${commentId}`,
        { headers: { Authorization: `Bearer ${customerToken}` } }
      );
      console.log('Customer deleted their comment:', deleteCommentRes.data);
      // Assert comment is removed in response
      if (deleteCommentRes.data.comments && deleteCommentRes.data.comments.some(c => c._id === commentId)) {
        throw new Error('Comment still present in response after deletion');
      }
      // Fetch track again and assert comment is gone
      const trackAfterDelete = await axios.get(
        `${BASE_URL}/public/tracks/${adminUploadedTrackId}`
      );
      const commentsAfterDelete = trackAfterDelete.data.comments || (trackAfterDelete.data.track && trackAfterDelete.data.track.comments) || [];
      if (commentsAfterDelete.some(c => c._id === commentId)) {
        throw new Error('Comment still present on track after deletion');
      }
    } else {
      console.log('No commentId found to delete.');
    }
  } catch (err) {
    console.error('Error in test flow:', err);
  } finally {
    // Cleanup: Delete test users and tracks created during the test
    try {
      await User.deleteMany({ email: { $regex: new RegExp('^' + TEST_EMAIL + '$', 'i') } });
      await User.deleteMany({ email: { $regex: new RegExp('^' + CUSTOMER_EMAIL + '$', 'i') } });
      console.log('Cleanup completed: test users deleted');
    } catch (cleanupErr) {
      console.error('Error during cleanup:', cleanupErr);
    }
  }
}

main();
