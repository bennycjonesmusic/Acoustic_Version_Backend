// test_artist_examples_api_flow.js
// Standalone test for artist examples API routes
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import User from './models/User.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = `artist@example.com`;
const TEST_PASSWORD = 'Moobslikejabba123456';

let artistToken, artistId, exampleId;

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
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    // Clean up test artist user
    await User.deleteMany({ email: { $regex: new RegExp('^' + TEST_EMAIL + '$', 'i') } });
    // Register artist
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        username: 'ArtistExampleTest',
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        role: 'artist',
        about: 'Artist for example API test'
      });
    } catch (err) {
      console.error('Artist already exists, skipping.', err.response ? err.response.data : err);
    }
    artistToken = await login(TEST_EMAIL, TEST_PASSWORD);
    // Get artist user ID after login
    const artistProfileRes = await axios.get(
      `${BASE_URL}/users/me`,
      { headers: { Authorization: `Bearer ${artistToken}` } }
    );
    artistId = artistProfileRes.data.user._id || artistProfileRes.data.user.id;
    // --- ARTIST EXAMPLES ROUTES TEST ---
    // 1. Upload an artist example (audio)
    const exampleAudioPath = path.join(__dirname, 'test-assets', 'sample.mp3');
    const exampleForm = new FormData();
    exampleForm.append('file', fs.createReadStream(exampleAudioPath));
    exampleForm.append('type', 'audio');
    exampleForm.append('title', 'Test Example Audio');
    let exampleUploadRes;
    try {
      exampleUploadRes = await axios.post(
        `${BASE_URL}/users/artist/examples/upload`,
        exampleForm,
        {
          headers: {
            ...exampleForm.getHeaders(),
            Authorization: `Bearer ${artistToken}`
          }
        }
      );
      console.log('Artist example upload response:', exampleUploadRes.data);
    } catch (err) {
      if (err.response) {
        console.error('Artist example upload failed:', err.response.data);
      } else {
        console.error('Artist example upload failed:', err);
      }
      throw err;
    }    const uploadedExamples = exampleUploadRes.data.artistExamples || [];
    const lastExample = uploadedExamples[uploadedExamples.length - 1];
    exampleId = lastExample && (lastExample.id || lastExample._id);
    if (!exampleId) {
      throw new Error('Artist example upload failed: missing example id');
    }
    // 2. Fetch artist examples (use artistId)
    const myExamplesRes = await axios.get(
      `${BASE_URL}/users/artist/${artistId}/examples`,
      { headers: { Authorization: `Bearer ${artistToken}` } }
    );
    console.log('Artist examples response:', myExamplesRes.data);
    const foundExample = (myExamplesRes.data.artistExamples || myExamplesRes.data).find(e => e._id === exampleId || e.id === exampleId);
    if (!foundExample) {
      throw new Error('Uploaded artist example not found in artist examples');
    }
    // 3. Delete the example
    const deleteExampleRes = await axios.delete(
      `${BASE_URL}/users/artist/examples/${exampleId}`,
      { headers: { Authorization: `Bearer ${artistToken}` } }
    );
    console.log('Artist example delete response:', deleteExampleRes.data);
    if (deleteExampleRes.status !== 200) {
      throw new Error('Failed to delete artist example');
    }
    // Confirm deletion
    const myExamplesAfterDelete = await axios.get(
      `${BASE_URL}/users/artist/${artistId}/examples`,
      { headers: { Authorization: `Bearer ${artistToken}` } }
    );
    const stillExists = (myExamplesAfterDelete.data.artistExamples || myExamplesAfterDelete.data).some(e => e._id === exampleId || e.id === exampleId);
    if (stillExists) {
      throw new Error('Artist example still present after deletion');
    }
    console.log('Artist example upload, fetch, and delete test passed.');
    // Cleanup: Delete test artist
    await User.deleteMany({ email: { $regex: new RegExp('^' + TEST_EMAIL + '$', 'i') } });
    console.log('Cleanup completed: test artist deleted');
  } catch (err) {
    console.error('Error in artist examples API test flow:', err.stack || err);
  }
}

main();
