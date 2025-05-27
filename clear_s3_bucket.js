// Script to clear S3 bucket by calling the admin API route
// Usage: node clear_s3_bucket.js
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = process.env.OWNER_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Moobslikejabba123456';

async function getAdminToken() {
  const res = await axios.post(`${BASE_URL}/auth/login`, {
    login: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });
  if (!res.data.token) throw new Error('Admin login failed');
  return res.data.token;
}

async function clearS3ViaAdminRoute() {
  try {
    const token = await getAdminToken();
    const res = await axios.delete(
      `${BASE_URL}/admin/clear-s3`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('Response:', res.data);
  } catch (err) {
    if (err.response) {
      console.error('Error:', err.response.data);
    } else {
      console.error('Error:', err.message);
    }
    process.exit(1);
  }
}

clearS3ViaAdminRoute();
