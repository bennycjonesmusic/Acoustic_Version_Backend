import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

const CUSTOMER_EMAIL = 'sarahandbenduo@gmail.com';
const CUSTOMER_PASSWORD = 'Moobslikejabba123456'; 
const ARTIST_EMAIL = "sarahandbenduo@gmail.com";
const ARTIST_PASSWORD = "Moobslikejabba123456";

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
  // 1. Login as customer and artist
  const customerToken = await login(CUSTOMER_EMAIL, CUSTOMER_PASSWORD);
  const artistToken = await login(ARTIST_EMAIL, ARTIST_PASSWORD);

  // 2. Get artist userId
  const artistRes = await axios.get(`${BASE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${artistToken}` }
  });
  const artistId = artistRes.data.id;

  // 3. Create a commission request as customer
  const commissionReq = await axios.post(`${BASE_URL}/commission/request`, {
    title: "Test Commission Track",
    description: "Please create a test track for automation.",
    artist: artistId,
    key: "C",
    tempo: 120
  }, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  const commissionId = commissionReq.data._id || commissionReq.data.id;
  console.log("Commission request created:", commissionId);

  // 4. Upload a track as artist for the commission
  const form = new FormData();
  form.append('title', 'Commissioned Track Upload');
  form.append('commissionId', commissionId);
  form.append('price', 100); // £1.00
  form.append('file', fs.createReadStream(path.join(__dirname, 'test-assets', 'sample.mp3')));

  const uploadRes = await axios.post(`${BASE_URL}/tracks/upload`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${artistToken}`
    }
  });
  const trackId = uploadRes.data._id || uploadRes.data.id;
  console.log("Track uploaded for commission:", trackId);

  // 5. Approve the commission (simulate admin approval if required)
  // If your flow requires admin approval, login as admin and approve
  // Otherwise, skip or simulate as artist
  // Example (uncomment and set credentials if needed):
  // const adminToken = await login('admin@email.com', 'adminpassword');
  // await axios.post(`${BASE_URL}/commission/approve/${commissionId}`, {}, {
  //   headers: { Authorization: `Bearer ${adminToken}` }
  // });

  // 6. Simulate purchase of the track (as customer)
  // If the track is free, this may not be needed
  const checkoutRes = await axios.post(`${BASE_URL}/create-checkout-session`, {
    trackId: trackId
  }, {
    headers: { Authorization: `Bearer ${customerToken}` }
  });
  console.log("Checkout session created:", checkoutRes.data.id || checkoutRes.data);

  // 7. Output for manual verification
  console.log("\n--- Commission Flow Test Complete ---");
  console.log("Commission ID:", commissionId);
  console.log("Track ID:", trackId);
  console.log("Artist ID:", artistId);
  console.log("Customer Token:", customerToken);
  console.log("Artist Token:", artistToken);
  console.log("\nCheck your database and Stripe dashboard to verify commission payout and track ownership.");
}

main().catch(err => {
  console.error("Test failed:", err.response ? err.response.data : err);
  process.exit(1);
});

