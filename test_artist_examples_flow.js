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

    // Upload artist example
    const filePath = path.join(__dirname, 'test-assets', 'sample.mp3');
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath));
    const uploadRes = await axios.post(
      `${BASE_URL}/users/artist/examples/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${artistToken}`
        }
      }
    );
    console.log('Upload response:', uploadRes.data);
    exampleId = uploadRes.data.artistExamples[0].id;

    // Approve artist as admin before uploading track
    // Login as admin
    const ADMIN_EMAIL = 'acousticversionuk@gmail.com';
    const ADMIN_PASSWORD = 'Moobslikejabba123456';
    const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
    try {
      await axios.post(`${BASE_URL}/admin/approve-artist/${artistId}`, {}, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      console.log('Artist approved by admin.');
    } catch (err) {
      console.error('Artist approval failed or already approved:', err.response ? err.response.data : err);
    }

    // Upload a paid track as artist
    const trackForm = new FormData();
    trackForm.append('file', fs.createReadStream(filePath));
    trackForm.append('title', 'Test Paid Track');
    trackForm.append('price', '10'); // as string
    trackForm.append('description', 'Test paid track upload');
    trackForm.append('originalArtist', 'Test Original Artist');
    trackForm.append('backingTrackType', 'Acoustic Guitar');
    trackForm.append('genre', 'Pop'); // required
    trackForm.append('vocalRange', 'Tenor'); // required
    const uploadTrackRes = await axios.post(
      `${BASE_URL}/tracks/upload`,
      trackForm,
      {
        headers: {
          ...trackForm.getHeaders(),
          Authorization: `Bearer ${artistToken}`
        }
      }
    );
    console.log('Track upload response:', uploadTrackRes.data);
    const uploadedTrack = uploadTrackRes.data.track;
    const uploadedTrackId = uploadedTrack._id || uploadedTrack.id;
    // Assert track upload
    if (!uploadedTrack || !uploadedTrackId || !uploadedTrack.fileUrl || !uploadedTrack.previewUrl) {
      throw new Error('Track upload failed: missing _id/id, fileUrl, or previewUrl');
    }
    if (uploadedTrack.price !== 10 || uploadedTrack.title !== 'Test Paid Track') {
      throw new Error('Track upload failed or incorrect track data');
    }
    // If preview failed, do not proceed to delete
    if (uploadTrackRes.data.previewError) {
      throw new Error('Track upload preview failed: ' + uploadTrackRes.data.previewError);
    }

    // Fetch artist examples
    const fetchRes = await axios.get(`${BASE_URL}/users/artist/${artistId}/examples`);
    console.log('Fetch response:', fetchRes.data);

    // Fetch artist examples as customer (should be allowed if public)
    const fetchResCustomer = await axios.get(`${BASE_URL}/users/artist/${artistId}/examples`, {
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    console.log('Fetch as customer response:', fetchResCustomer.data);

    // Fetch artist examples as public (no auth header)
    const fetchResPublic = await axios.get(`${BASE_URL}/users/artist/${artistId}/examples`);
    console.log('Fetch as public response:', fetchResPublic.data);

    // Delete artist example
    const deleteRes = await axios.delete(
      `${BASE_URL}/users/artist/examples/${exampleId}`,
      { headers: { Authorization: `Bearer ${artistToken}` } }
    );
    console.log('Delete response:', deleteRes.data);

    // Try to download the paid track as customer (should be unauthorized)
    let downloadUnauthorized = false;
    let downloadRes;
    try {
      downloadRes = await axios.get(
        `${BASE_URL}/tracks/download/${uploadedTrackId}`,
        { headers: { Authorization: `Bearer ${customerToken}` }, responseType: 'stream' }
      );
    } catch (err) {
      if (err.response && (err.response.status === 403 || err.response.status === 401)) {
        downloadUnauthorized = true;
        console.log('Download as customer unauthorized as expected:', err.response.status);
      } else {
        throw err;
      }
    }

    // Delete the uploaded paid track as artist
    let deleteTrackRes;
    if (uploadedTrackId) {
      deleteTrackRes = await axios.delete(
        `${BASE_URL}/tracks/${uploadedTrackId}`,
        { headers: { Authorization: `Bearer ${artistToken}` } }
      );
      console.log('Delete track response:', deleteTrackRes.data);
    } else {
      console.warn('No uploadedTrackId found, skipping track delete.');
    }

    // Simple assertions
    if (
      uploadRes.status === 200 &&
      uploadRes.data.artistExamples.length === 1 &&
      /^https:\/\//.test(uploadRes.data.artistExamples[0].url) &&
      fetchRes.status === 200 &&
      Array.isArray(fetchRes.data.artistExamples) &&
      fetchRes.data.artistExamples.length > 0 &&
      fetchRes.data.artistExamples[0].id === exampleId &&
      fetchResCustomer.status === 200 &&
      Array.isArray(fetchResCustomer.data.artistExamples) &&
      fetchResCustomer.data.artistExamples.length > 0 &&
      fetchResCustomer.data.artistExamples[0].id === exampleId &&
      fetchResPublic.status === 200 &&
      Array.isArray(fetchResPublic.data.artistExamples) &&
      fetchResPublic.data.artistExamples.length > 0 &&
      fetchResPublic.data.artistExamples[0].id === exampleId &&
      deleteRes.status === 200 &&
      deleteRes.data.artistExamples.length === 0 &&
      deleteTrackRes.status === 200 &&
      deleteTrackRes.data.message && deleteTrackRes.data.message.toLowerCase().includes('deleted') &&
      downloadUnauthorized
    ) {
      console.log('All artist example and track API tests passed!');
    } else {
      throw new Error('One or more artist example or track API checks failed.');
    }




  } catch (err) {
    console.error('Test failed:', err.response ? err.response.data : err);
    process.exit(1);
  } finally {
    // Clean up both artist and customer test users after running test (case-insensitive)
    await User.deleteMany({ email: { $regex: new RegExp('^' + TEST_EMAIL + '$', 'i') } });
    await User.deleteMany({ email: { $regex: new RegExp('^' + CUSTOMER_EMAIL + '$', 'i') } });
    await mongoose.connection.close();
  }
}

main();
