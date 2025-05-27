import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000'; // Change if your backend runs on a different port
const EMAIL = 'acousticversion@gmail.com';
const PASSWORD = 'YourPasswordHere'; // <-- Replace with the actual password

async function main() {
  // 1. Login to get JWT
  const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
    login: "sarahandbenduo@gmail.com",
    password: "Moobslikejabba123456",
  });
  const token = loginRes.data.token;
  if (!token) throw new Error('Login failed, no token returned');

  // 2. Prepare form data
  const form = new FormData();
  form.append('title', 'Sample Track3');
  form.append('originalArtist', 'Sample Artist');
  form.append('backingTrackType', 'Acoustic Guitar');
  form.append('genre', 'Pop');
  form.append('vocalRange', 'Tenor');
  form.append('description', 'Uploaded via script');
  form.append('price', 10.99);
  form.append('file', fs.createReadStream(path.join('test-assets', 'sample.mp3')));

  // 3. Upload track
  const uploadRes = await axios.post(`${BASE_URL}/tracks/upload`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${token}`,
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  console.log('Upload response:', uploadRes.data);
}

main().catch(err => {
  console.error('Error:', err.response?.data || err.message);
});
