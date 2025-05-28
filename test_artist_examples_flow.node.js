// test_artist_examples_flow.node.js
// Node.js script for artist example upload, fetch, and delete using axios and real HTTP requests
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('./models/User.js');

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'artist@example.com';
const TEST_PASSWORD = 'testpass123';
let artistToken, artistId, exampleId;

async function main() {
  try {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URI);
    }
    await User.deleteMany({ email: TEST_EMAIL });
    const user = new User({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      role: 'artist',
      artistExamples: [],
      isEmailVerified: true
    });
    await user.save();
    artistId = user._id.toString();
    // Login to get token
    const res = await axios.post(`${BASE_URL}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    artistToken = res.data.token;

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
  } catch (err) {
    console.error('Test failed:', err.response ? err.response.data : err);
  } finally {
    await User.deleteMany({ email: TEST_EMAIL });
    await mongoose.connection.close();
  }
}

main();
