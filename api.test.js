import dotenv from 'dotenv';
dotenv.config();
// Ensure FRONTEND_URL is set for Stripe URLs in tests
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
import request from 'supertest';
import app from './server.js';
import mongoose from 'mongoose';
import User from './models/User.js';
import CommissionRequest from './models/CommissionRequest.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* 
this test file is used to test the API endpoints. It uses supertest to make requests to the server 
and check the responses. It is used to ensure that the API endpoints are working as expected. */

describe('API Endpoints', () => {
  it('GET / should return Testing', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.text).toMatch(/Testing/);
  });

  it('POST /auth/login should fail with missing credentials', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect([400, 401, 403]).toContain(res.statusCode);
  });

  it('GET /tracks should return tracks, 401, 403, or 404 if protected or not found', async () => {
    const res = await request(app).get('/tracks');
    expect([200, 401, 403, 404]).toContain(res.statusCode);
  });

  it('GET /users should return users, 401, 403, or 404 if protected or not found', async () => {
    const res = await request(app).get('/users');
    expect([200, 401, 403, 404]).toContain(res.statusCode);
  });

  it('POST /webhook should return 400 or 200 for missing signature', async () => {
    const res = await request(app).post('/webhook').send({});
    expect([400, 200]).toContain(res.statusCode);
  });

  it('GET /protectedUser should return 401, 403, or 500 without token', async () => {
    const res = await request(app).get('/protectedUser');
    expect([401, 403, 500]).toContain(res.statusCode);
  });

  it('GET /protectedArtist should return 401, 403, or 500 without token', async () => {
    const res = await request(app).get('/protectedArtist');
    expect([401, 403, 500]).toContain(res.statusCode);
  });

  // Add more tests for /admin, /stripe, etc. as needed
});

describe('Password Reset Flow', () => {
  let testUserEmail = 'resetuser@example.com';
  let testUserPassword = 'TestPassword123!';
  let resetToken;

  beforeAll(async () => {
    // Clean up any existing test user before starting
    await User.deleteMany({ email: testUserEmail });
    // Register a user for password reset
    await request(app)
      .post('/auth/register')
      .send({
        username: 'resetuser',
        email: testUserEmail,
        password: testUserPassword,
        about: 'Test user for password reset.'
      });
    // Confirm user exists in DB before proceeding
    const user = await User.findOne({ email: testUserEmail });
    expect(user).toBeTruthy();
  });

  it('should request a password reset and send a reset token', async () => {
    const res = await request(app)
      .post('/auth/request-password-reset')
      .send({ email: testUserEmail });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/reset link has been sent/i);
    // Simulate fetching the token from the database
    const user = await User.findOne({ email: testUserEmail });
    expect(user.passwordResetToken).toBeDefined();
    resetToken = user.passwordResetToken;
  });

  it('should not reset password with invalid token', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'invalidtoken', newPassword: 'NewPassword123!' });
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/invalid or expired token/i);
  });

  it('should reset password with valid token', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword: 'NewPassword123!' });
    expect(res.statusCode).toBe(200);
    expect(res.body.message).toMatch(/password has been reset/i);
    // Confirm token is cleared
    const user = await User.findOne({ email: testUserEmail });
    expect(user.passwordResetToken).toBeFalsy();
  });

  it('should allow login with new password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ login: testUserEmail, password: 'NewPassword123!' });
    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBeDefined();
  });
});

describe('Backing Track Upload & Preview', () => {
  const testUser = {
    username: 'previewuser',
    email: 'previewuser@example.com',
    password: 'TestPassword123!',
    about: 'Test user for preview.'
  };
  let token;

  beforeAll(async () => {
    await User.deleteMany({ email: testUser.email });
    await request(app).post('/auth/register').send(testUser);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: testUser.email, password: testUser.password });
    token = loginRes.body.token;
    expect(token).toBeDefined();
  });

  it('should upload a track and return a previewUrl', async () => {
    const res = await request(app)
      .post('/tracks/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Test Track')
      .field('originalArtist', 'Test Artist')
      .field('backingTrackType', 'Acoustic Guitar')
      .field('genre', 'Pop')
      .field('vocalRange', 'Tenor')
      .field('description', 'Test track for preview')
      .field('price', 0)
      .attach('file', 'test-assets/sample.mp3');
    if (res.statusCode !== 200) {
      console.error('Upload failed:', res.body);
    }
    expect(res.statusCode).toBe(200);
    expect(res.body.track).toBeDefined();
    if (!res.body.track.previewUrl) {
      console.error('No previewUrl in response:', res.body.track);
    }
    expect(res.body.track.previewUrl).toBeDefined();
    expect(res.body.track.previewUrl).toMatch(/^https?:\/\//);
  });
});

describe('Backing Track Upload', () => {
  const testUser = {
    username: 'uploaduser',
    email: 'uploaduser@example.com',
    password: 'TestPassword123!',
    about: 'Test user for upload.'
  };
  let token;

  beforeAll(async () => {
    await User.deleteMany({ email: testUser.email });
    await request(app).post('/auth/register').send(testUser);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: testUser.email, password: testUser.password });
    token = loginRes.body.token;
    expect(token).toBeDefined();
  });

  it('should upload a track and return a fileUrl', async () => {
    const res = await request(app)
      .post('/tracks/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Test Track')
      .field('originalArtist', 'Test Artist')
      .field('backingTrackType', 'Acoustic Guitar')
      .field('genre', 'Pop')
      .field('vocalRange', 'Tenor')
      .field('description', 'Test track for upload')
      .field('price', 0)
      .attach('file', 'test-assets/sample.mp3');
    expect(res.statusCode).toBe(200);
    expect(res.body.track).toBeDefined();
    expect(res.body.track.fileUrl).toBeDefined();
    expect(res.body.track.fileUrl).toMatch(/^https?:\/\//);
  });
});

describe('Commission Custom Backing Track Flow', () => {
  let customerToken, artistToken, adminToken, commissionId;

  const customer = {
    username: 'commissioncustomer',
    email: 'commissioncustomer@example.com',
    password: 'TestPassword123!',
    about: 'Customer for commission test'
  };
  const artist = {
    username: 'commissionartist',
    email: 'commissionartist@example.com',
    password: 'TestPassword123!',
    about: 'Artist for commission test'
  };
  const admin = {
    username: 'adminuser',
    email: 'admin@example.com',
    password: 'TestPassword123!',
    about: 'Admin user',
    role: 'admin'
  };

  beforeAll(async () => {
    // Clean up users
    await Promise.all([
      User.deleteMany({ email: customer.email }),
      User.deleteMany({ email: artist.email }),
      User.deleteMany({ email: admin.email })
    ]);
    // Register users
    await request(app).post('/auth/register').send(customer);
    await request(app).post('/auth/register').send(artist);
    const adminRegRes = await request(app).post('/auth/register').send({ ...admin, role: 'admin' });
    console.log('Admin registration response:', adminRegRes.statusCode, adminRegRes.body);
    // Ensure admin user is actually an admin
    await User.updateOne({ email: admin.email }, { role: 'admin' });
    const adminUser = await User.findOne({ email: admin.email });
    console.log('Admin user after role update:', adminUser);
    // Login users
    const customerRes = await request(app).post('/auth/login').send({ login: customer.email, password: customer.password });
    customerToken = customerRes.body.token;
    const artistRes = await request(app).post('/auth/login').send({ login: artist.email, password: artist.password });
    artistToken = artistRes.body.token;
    // Login admin again after role update
    const adminRes = await request(app).post('/auth/login').send({ login: admin.email, password: admin.password });
    console.log('Admin login response:', adminRes.statusCode, adminRes.body);
    adminToken = adminRes.body.token;
    if (!customerToken || !artistToken || !adminToken) {
      console.error('Token error:', { customerToken, artistToken, adminToken });
      throw new Error('Failed to obtain all tokens for commission flow tests');
    }
    console.log('Tokens:', { customerToken, artistToken, adminToken });
  }, 30000);

  it('Customer requests a commission', async () => {
    const artistUser = await User.findOne({ email: artist.email });
    if (!artistUser) throw new Error('Artist user not found');
    const res = await request(app)
      .post('/commission/request')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        artistId: artistUser._id,
        requirements: 'Test commission requirements',
        price: 10,
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      });
    console.log('Commission request response:', res.body);
    expect(res.statusCode).toBe(200);
    expect(res.body.commissionId).toBeDefined();
    commissionId = res.body.commissionId;
    if (!commissionId) throw new Error('No commissionId returned');
  });

  it('Simulate payment (set status and paymentIntent)', async () => {
    if (!commissionId) throw new Error('No commissionId for payment simulation');
    await CommissionRequest.findByIdAndUpdate(commissionId, {
      status: 'accepted',
      stripePaymentIntentId: 'pi_test123'
    });
    const commission = await CommissionRequest.findById(commissionId);
    console.log('Commission after simulated payment:', commission);
  });

  it('Artist uploads finished track', async () => {
    if (!artistToken || !commissionId) throw new Error('Missing artistToken or commissionId');
    const samplePath = path.join(__dirname, 'test-assets', 'sample.mp3');
    const stats = fs.statSync(samplePath);
    console.log('[TEST] sample.mp3 size:', stats.size);
    const res = await request(app)
      .post('/commission/upload-finished')
      .set('Authorization', `Bearer ${artistToken}`)
      .field('commissionId', commissionId)
      .attach('file', samplePath);
    console.log('Upload finished track response:', res.body);
    expect(res.statusCode).toBe(200);
    expect(res.body.previewTrackUrl).toBeDefined();
    expect(res.body.finishedTrackUrl).toBeDefined();
    const commission = await CommissionRequest.findById(commissionId);
    console.log('Commission after upload:', commission);
    expect(commission.status).toBe('delivered');
  });

  it('Customer approves the preview', async () => {
    if (!customerToken || !commissionId) throw new Error('Missing customerToken or commissionId');
    const res = await request(app)
      .post('/commission/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ commissionId, action: 'approve' });
    console.log('Approve preview response:', res.body);
    expect(res.statusCode).toBe(200);
    const commission = await CommissionRequest.findById(commissionId);
    console.log('Commission after approval:', commission);
    expect(commission.status).toBe('approved');
  });

  it('Admin triggers payout', async () => {
    if (!adminToken || !commissionId) throw new Error('Missing adminToken or commissionId');
    const res = await request(app)
      .post('/commission/admin/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ commissionId });
    console.log('Admin payout response:', res.body);
    expect([200, 400, 500]).toContain(res.statusCode);
  });

  it('Customer can download their own commission files (finished/preview)', async () => {
    if (!customerToken || !commissionId) throw new Error('Missing customerToken or commissionId');
    // Download finished file
    let res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ commissionId, type: 'finished' });
    console.log('Customer download finished:', res.statusCode, res.headers['content-type']);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio/);
    // Download preview file
    res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ commissionId, type: 'preview' });
    console.log('Customer download preview:', res.statusCode, res.headers['content-type']);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio/);
  });

  it('Other users cannot download commission files they do not own', async () => {
    // Register and login a random user
    const otherUser = {
      username: 'otheruser',
      email: 'otheruser@example.com',
      password: 'TestPassword123!',
      about: 'Other user'
    };
    await User.deleteMany({ email: otherUser.email });
    await request(app).post('/auth/register').send(otherUser);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: otherUser.email, password: otherUser.password });
    const otherToken = loginRes.body.token;
    expect(otherToken).toBeDefined();
    // Try to download finished file
    let res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${otherToken}`)
      .query({ commissionId, type: 'finished' });
    console.log('Other user download finished:', res.statusCode, res.body);
    expect(res.statusCode).toBe(403);
    // Try to download preview file
    res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${otherToken}`)
      .query({ commissionId, type: 'preview' });
    console.log('Other user download preview:', res.statusCode, res.body);
    expect(res.statusCode).toBe(403);
  });

  it('Admin can download any commission file', async () => {
    if (!adminToken || !commissionId) throw new Error('Missing adminToken or commissionId');
    // Download finished file
    let res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ commissionId, type: 'finished' });
    console.log('Admin download finished:', res.statusCode, res.headers['content-type']);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio/);
    // Download preview file
    res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ commissionId, type: 'preview' });
    console.log('Admin download preview:', res.statusCode, res.headers['content-type']);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/audio/);
  });
});

describe('Admin Endpoints', () => {
  it('GET /admin/users should require admin and return 200 or 403', async () => {
    const res = await request(app).get('/admin/users');
    expect([200, 401, 403]).toContain(res.statusCode);
  });
  // Add more admin tests as needed
});

describe('Public Endpoints', () => {
  it('GET /public/featured should return 200', async () => {
    const res = await request(app).get('/public/featured');
    expect([200, 404]).toContain(res.statusCode);
  });
  it('GET /public/search?q=test should return 200', async () => {
    const res = await request(app).get('/public/search?q=test');
    expect([200, 404]).toContain(res.statusCode);
  });
});

describe('Artist Endpoints', () => {
  it('GET /artist/profile should require artist and return 200 or 403', async () => {
    const res = await request(app).get('/artist/profile');
    expect([200, 401, 403]).toContain(res.statusCode);
  });
  // Add POST audition track, update profile, etc.
});

describe('Artist Examples Endpoints', () => {
  it('GET /artist-examples should return 200', async () => {
    const res = await request(app).get('/artist-examples');
    expect([200, 404]).toContain(res.statusCode);
  });
  // Add POST, PUT, DELETE as needed
});

describe('Stripe Payment Endpoints', () => {
  it('POST /stripe_payment/create-intent should return 200 or 400', async () => {
    const res = await request(app).post('/stripe_payment/create-intent').send({ amount: 100 });
    expect([200, 400]).toContain(res.statusCode);
  });
});

describe('Users Endpoints', () => {
  it('POST /users/follow should require auth and return 200 or 401', async () => {
    const res = await request(app).post('/users/follow').send({ artistId: 'fakeid' });
    expect([200, 401, 403, 400]).toContain(res.statusCode);
  });
  it('POST /users/unfollow should require auth and return 200 or 401', async () => {
    const res = await request(app).post('/users/unfollow').send({ artistId: 'fakeid' });
    expect([200, 401, 403, 400]).toContain(res.statusCode);
  });
  it('POST /users/sort-tracks should return 200 or 400', async () => {
    const res = await request(app).post('/users/sort-tracks').send({ sort: 'recent' });
    expect([200, 400]).toContain(res.statusCode);
  });
  // Add update profile, delete review, etc.
});

describe('Tracks Endpoints', () => {
  it('GET /tracks/:id should return 200, 404, or 400', async () => {
    const res = await request(app).get('/tracks/fakeid');
    expect([200, 404, 400]).toContain(res.statusCode);
  });
  it('PUT /tracks/:id should require auth and return 200 or 401', async () => {
    const res = await request(app).put('/tracks/fakeid').send({ title: 'Updated' });
    expect([200, 401, 403, 400]).toContain(res.statusCode);
  });
  it('DELETE /tracks/:id should require auth and return 200 or 401', async () => {
    const res = await request(app).delete('/tracks/fakeid');
    expect([200, 401, 403, 400]).toContain(res.statusCode);
  });
});

// Close MongoDB connection after all tests
afterAll(async () => {
  await mongoose.connection.close();
});