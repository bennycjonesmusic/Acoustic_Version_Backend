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
   
    
    await User.deleteMany({ email: /artist.*@example.com/i });


    try {

    await axios.post(`${BASE_URL}/auth/register`, {
      username: 'CommissionCustomer',
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      role: 'artist',
      about: 'Customer for commission test'
    });
} catch (err) {



    console.error('User already exists, skipping.', err.response ? err.response.data : err); //for some reason user exists
}

      

    

    
    const artistToken = await login(TEST_EMAIL, TEST_PASSWORD);
    // Login to get token
   
    const myRes = await axios.get(`${BASE_URL}/users/me`, {
        headers: { Authorization: `Bearer ${artistToken}` }

    });
   
    artistId = myRes.data.id || myRes.data._id || (myRes.data.user && (myRes.data.user.id || myRes.data.user._id)); //ensure it is correct

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

    // Fetch artist examples
    const fetchRes = await axios.get(`${BASE_URL}/users/artist/${artistId}/examples`);
    console.log('Fetch response:', fetchRes.data);

    // Delete artist example
    const deleteRes = await axios.delete(
      `${BASE_URL}/users/artist/examples/${exampleId}`,
      { headers: { Authorization: `Bearer ${artistToken}` } }
    );
    console.log('Delete response:', deleteRes.data);

    // Simple assertions
    if (
      uploadRes.status === 200 &&
      uploadRes.data.artistExamples.length === 1 &&
      /^https:\/\//.test(uploadRes.data.artistExamples[0].url) &&
      fetchRes.status === 200 &&
      Array.isArray(fetchRes.data.artistExamples) &&
      fetchRes.data.artistExamples.length > 0 &&
      fetchRes.data.artistExamples[0].id === exampleId &&
      deleteRes.status === 200 &&
      deleteRes.data.artistExamples.length === 0
    ) {
      console.log('All artist example API tests passed!');
    } else {
      throw new Error('One or more artist example API checks failed.');
    }
  } catch (err) {
    console.error('Test failed:', err.response ? err.response.data : err);
    process.exit(1);
  } finally {
    await User.deleteMany({ email: /artist.*@example.com/i });
    await mongoose.connection.close();
  }
}

main();
