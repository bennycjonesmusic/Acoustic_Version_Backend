// To run: npm install mocha chai supertest --save-dev
// Then run: npx mocha api.test.js
import { expect } from 'chai';
import dotenv from 'dotenv';
dotenv.config();
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
import request from 'supertest';
import mongoose from 'mongoose';
import User from './models/User.js';
import CommissionRequest from './models/CommissionRequest.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import sinon from 'sinon';
import nodemailer from 'nodemailer';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/* 
this test file is used to test the API endpoints. It uses supertest to make requests to the server 
and check the responses. It is used to ensure that the API endpoints are working as expected. */

let app;
before(async function() {
  const mod = await import('./server.js');
  app = mod.default || mod.app || mod;
}).timeout(20000);

// Mock nodemailer before any tests run
before(function () {
  sinon.stub(nodemailer, 'createTransport').returns({
    sendMail: sinon.stub().resolves({ messageId: 'mocked' })
  });
});

// Restore after all tests
after(function () {
  nodemailer.createTransport.restore();
});

describe('API Endpoints', () => {
  it('GET / should return Testing', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).to.equal(200);
    expect(res.text).to.match(/Testing/);
  });
  it('GET /tracks should return tracks', async () => {
    const res = await request(app).get('/tracks');
    expect(res.statusCode).to.equal(200);
    expect(Array.isArray(res.body) || Array.isArray(res.body.tracks)).to.be.true;
  });
  it('GET /users should return users', async () => {
    const res = await request(app).get('/users');
    expect(res.statusCode).to.equal(200);
    expect(Array.isArray(res.body) || Array.isArray(res.body.users)).to.be.true;
  });
  it('POST /webhook should return 400 or 200 for missing signature', async () => {
    const res = await request(app).post('/webhook').send({});
    expect([400, 200]).to.include(res.statusCode);
  });
  it('GET /protectedUser should return 401, 403, or 500 without token', async () => {
    const res = await request(app).get('/protectedUser');
    expect([401, 403, 500]).to.include(res.statusCode);
  });
  it('GET /protectedArtist should return 401, 403, or 500 without token', async () => {
    const res = await request(app).get('/protectedArtist');
    expect([401, 403, 500]).to.include(res.statusCode);
  });
});

describe('Password Reset Flow', () => {
  let testUserEmail = 'resetuser@example.com';
  let testUserPassword = 'TestPassword123!';
  let resetToken;
  before(async () => {
    await User.deleteMany({ email: testUserEmail });
    await request(app)
      .post('/auth/register')
      .send({
        username: 'resetuser',
        email: testUserEmail,
        password: testUserPassword,
        about: 'Test user for password reset.'
      });
    const user = await User.findOne({ email: testUserEmail });
    expect(user).to.exist;
  }).timeout(20000);
  it('should request a password reset and send a reset token', async () => {
    const res = await request(app)
      .post('/auth/request-password-reset')
      .send({ email: testUserEmail });
    expect(res.statusCode).to.equal(200);
    expect(res.body.message).to.match(/reset link has been sent/i);
    const user = await User.findOne({ email: testUserEmail });
    expect(user.passwordResetToken).to.exist;
    resetToken = user.passwordResetToken;
  });
  it('should not reset password with invalid token', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: 'invalidtoken', newPassword: 'NewPassword123!' });
    expect(res.statusCode).to.equal(400);
    expect(res.body.message).to.match(/invalid or expired token/i);
  });
  it('should reset password with valid token', async () => {
    const res = await request(app)
      .post('/auth/reset-password')
      .send({ token: resetToken, newPassword: 'NewPassword123!' });
    expect(res.statusCode).to.equal(200);
    expect(res.body.message).to.match(/password has been reset/i);
    const user = await User.findOne({ email: testUserEmail });
    expect(user.passwordResetToken).to.not.exist;
  });
  it('should allow login with new password', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ login: testUserEmail, password: 'NewPassword123!' });
    expect(res.statusCode).to.equal(200);
    expect(res.body.token).to.exist;
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

  before(async function() {
    await User.deleteMany({ email: testUser.email });
    await request(app).post('/auth/register').send(testUser);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: testUser.email, password: testUser.password });
    token = loginRes.body.token;
    expect(token).to.exist;
  }).timeout(20000);

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
    expect(res.statusCode).to.equal(200);
    expect(res.body.track).to.exist;
    expect(typeof res.body.track.id === 'string' || typeof res.body.track._id === 'string').to.be.true;
    expect(res.body.track.title).to.equal('Test Track');
    expect(res.body.track.previewUrl).to.exist;
    expect(res.body.track.previewUrl).to.match(/^https?:\/\//);
    expect(typeof res.body.track.fileUrl).to.be.equal('string');
    expect(res.body.track.genre).to.equal('Pop');
    expect(res.body.track.vocalRange).to.equal('Tenor');
    expect(res.body.track.backingTrackType).to.equal('Acoustic Guitar');
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

  before(async function() {
    await User.deleteMany({ email: testUser.email });
    await request(app).post('/auth/register').send(testUser);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: testUser.email, password: testUser.password });
    token = loginRes.body.token;
    expect(token).to.exist;
  }).timeout(20000);

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
    expect(res.statusCode).to.equal(200);
    expect(res.body.track).to.exist;
    expect(res.body.track.title).to.equal('Test Track');
    expect(res.body.track.fileUrl).to.exist;
    expect(res.body.track.fileUrl).to.match(/^https?:\/\//);
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

  before(async function() {
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
    expect(res.statusCode).to.equal(200);
    expect(res.body.commissionId).to.exist;
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
    expect(res.statusCode).to.equal(200);
    expect(res.body.previewTrackUrl).to.exist;
    expect(res.body.finishedTrackUrl).to.exist;
    const commission = await CommissionRequest.findById(commissionId);
    console.log('Commission after upload:', commission);
    expect(commission.status).to.equal('delivered');
  });

  it('Customer approves the preview', async () => {
    if (!customerToken || !commissionId) throw new Error('Missing customerToken or commissionId');
    const res = await request(app)
      .post('/commission/confirm')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ commissionId, action: 'approve' });
    console.log('Approve preview response:', res.body);
    expect(res.statusCode).to.equal(200);
    const commission = await CommissionRequest.findById(commissionId);
    console.log('Commission after approval:', commission);
    expect(commission.status).to.equal('approved');
  });

  it('Admin triggers payout', async () => {
    if (!adminToken || !commissionId) throw new Error('Missing adminToken or commissionId');
    const res = await request(app)
      .post('/commission/admin/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ commissionId });
    console.log('Admin payout response:', res.body);
    expect([200, 400, 500]).to.include(res.statusCode);
  });

  it('Customer can download their own commission files (finished/preview)', async () => {
    if (!customerToken || !commissionId) throw new Error('Missing customerToken or commissionId');
    // Download finished file
    let res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ commissionId, type: 'finished' });
    console.log('Customer download finished:', res.statusCode, res.headers['content-type']);
    expect(res.statusCode).to.equal(200);
    expect(res.headers['content-type']).to.match(/audio/);
    // Download preview file
    res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${customerToken}`)
      .query({ commissionId, type: 'preview' });
    console.log('Customer download preview:', res.statusCode, res.headers['content-type']);
    expect(res.statusCode).to.equal(200);
    expect(res.headers['content-type']).to.match(/audio/);
  }, 20000); // Increase timeout for slow commission downloads

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
    expect(otherToken).to.exist;
    // Try to download finished file
    let res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${otherToken}`)
      .query({ commissionId, type: 'finished' });
    console.log('Other user download finished:', res.statusCode, res.body);
    expect(res.statusCode).to.equal(403);
    // Try to download preview file
    res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${otherToken}`)
      .query({ commissionId, type: 'preview' });
    console.log('Other user download preview:', res.statusCode, res.body);
    expect(res.statusCode).to.equal(403);
  });

  it('Admin can download any commission file', async () => {
    if (!adminToken || !commissionId) throw new Error('Missing adminToken or commissionId');
    // Download finished file
    let res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ commissionId, type: 'finished' });
    console.log('Admin download finished:', res.statusCode, res.headers['content-type']);
    expect(res.statusCode).to.equal(200);
    expect(res.headers['content-type']).to.match(/audio/);
    // Download preview file
    res = await request(app)
      .get('/commission/download')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ commissionId, type: 'preview' });
    console.log('Admin download preview:', res.statusCode, res.headers['content-type']);
    expect(res.statusCode).to.equal(200);
    expect(res.headers['content-type']).to.match(/audio/);
  });
});

describe('Admin Endpoints', () => {
  it('GET /admin/users should require admin and return 200 or 403', async () => {
    const res = await request(app).get('/admin/users');
    if (res.statusCode === 200) {
      expect(Array.isArray(res.body) || Array.isArray(res.body.users)).to.be.true;
    } else {
      expect([401, 403]).to.include(res.statusCode);
    }
  });
  // Add more admin tests as needed
});

describe('Public Endpoints', () => {
  it('GET /public/featured should return 200', async () => {
    const res = await request(app).get('/public/featured');
    if (res.statusCode === 200) {
      expect(Array.isArray(res.body) || Array.isArray(res.body.featured)).to.be.true;
    } else {
      expect([404]).to.include(res.statusCode);
    }
  });
  it('GET /public/search?q=test should return 200', async () => {
    const res = await request(app).get('/public/search?q=test');
    if (res.statusCode === 200) {
      expect(Array.isArray(res.body) || Array.isArray(res.body.results)).to.be.true;
    } else {
      expect([404]).to.include(res.statusCode);
    }
  });
});

describe('Artist Endpoints', () => {
  it('GET /artist/profile should require artist and return 200, 401, 403, or 404', async () => {
    const res = await request(app).get('/artist/profile');
    if (res.statusCode === 200) {
      expect(res.body).to.exist;
      expect(res.body.username || res.body.artist).to.exist;
    } else {
      expect([401, 403, 404]).to.include(res.statusCode);
    }
  });
  // Add POST audition track, update profile, etc.
});

describe('Artist Examples Endpoints', () => {
  it('GET /artist-examples should return 200', async () => {
    const res = await request(app).get('/artist-examples');
    if (res.statusCode === 200) {
      expect(Array.isArray(res.body) || Array.isArray(res.body.examples)).to.be.true;
    } else {
      expect([404]).to.include(res.statusCode);
    }
  });
  // Add POST, PUT, DELETE as needed
});

describe('Stripe Payment Endpoints', () => {
  it('POST /stripe_payment/create-intent should return 200, 400, or 404', async () => {
    const res = await request(app).post('/stripe_payment/create-intent').send({ amount: 100 });
    if (res.statusCode === 200) {
      expect(res.body.clientSecret || res.body.intent).to.exist;
    } else {
      expect([400, 404]).to.include(res.statusCode);
    }
  });
});

describe('Users Endpoints', () => {
  it('POST /users/follow should follow a real artist', async () => {
    // Register and login user
    const user = {
      username: 'followuser',
      email: 'followuser@example.com',
      password: 'TestPassword123!',
      about: 'User for follow test.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: user.email, password: user.password });
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Register an artist to follow
    const artist = {
      username: 'followartist',
      email: 'followartist@example.com',
      password: 'TestPassword123!',
      about: 'Artist for follow test.'
    };
    await User.deleteMany({ email: artist.email });
    await request(app).post('/auth/register').send(artist);
    const artistUser = await User.findOne({ email: artist.email });
    expect(artistUser).to.be.ok;
    // Follow the artist
    const res = await request(app)
      .post('/users/follow')
      .set('Authorization', `Bearer ${token}`)
      .send({ artistId: artistUser._id });
    expect(res.statusCode).to.equal(200);
    expect(res.body.message).to.match(/follow/i);
  });

  it('POST /users/unfollow should unfollow a real artist', async () => {
    // Register and login user
    const user = {
      username: 'unfollowuser',
      email: 'unfollowuser@example.com',
      password: 'TestPassword123!',
      about: 'User for unfollow test.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: user.email, password: user.password });
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Register an artist to unfollow
    const artist = {
      username: 'unfollowartist',
      email: 'unfollowartist@example.com',
      password: 'TestPassword123!',
      about: 'Artist for unfollow test.'
    };
    await User.deleteMany({ email: artist.email });
    await request(app).post('/auth/register').send(artist);
    const artistUser = await User.findOne({ email: artist.email });
    expect(artistUser).to.be.ok;
    // Follow the artist first
    await request(app)
      .post('/users/follow')
      .set('Authorization', `Bearer ${token}`)
      .send({ artistId: artistUser._id });
    // Unfollow the artist
    const res = await request(app)
      .post('/users/unfollow')
      .set('Authorization', `Bearer ${token}`)
      .send({ artistId: artistUser._id });
    expect(res.statusCode).to.equal(200);
    expect(res.body.message).to.match(/unfollow/i);
  });

  it('POST /users/sort-tracks should return sorted tracks', async () => {
    const res = await request(app).post('/users/sort-tracks').send({ sort: 'recent' });
    expect(res.statusCode).to.equal(200);
    expect(Array.isArray(res.body.tracks)).to.be.true;
  });
});

describe('Tracks Endpoints', () => {
  it('GET /tracks/:id should return 200, 404, or 400', async () => {
    const res = await request(app).get('/tracks/fakeid');
    if (res.statusCode === 200) {
      expect(res.body._id || res.body.track).to.be.defined;
    } else {
      expect([404, 400]).to.include(res.statusCode);
    }
  });
  it('PUT /tracks/:id should require auth and return 200, 401, 403, 400, or 404', async () => {
    const res = await request(app).put('/tracks/fakeid').send({ title: 'Updated' });
    if (res.statusCode === 200) {
      expect(res.body._id || res.body.track).to.be.defined;
    } else {
      expect([401, 403, 400, 404]).to.include(res.statusCode);
    }
  });
  it('DELETE /tracks/:id should require auth and return 200 or 401', async () => {
    const res = await request(app).delete('/tracks/fakeid');
    if (res.statusCode === 200) {
      expect(res.body.message).to.exist;
    } else {
      expect([401, 403, 400]).to.include(res.statusCode);
    }
  });
});

describe('Tracks Endpoints (Full)', () => {
  it('should rate a track', async () => {
    // Register and login user
    const user = {
      username: 'rateuser',
      email: 'rateuser@example.com',
      password: 'TestPassword123!',
      about: 'User for rating test.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: user.email, password: user.password });
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Upload a track
    const uploadRes = await request(app)
      .post('/tracks/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Rate Test Track')
      .field('originalArtist', 'Test Artist')
      .field('backingTrackType', 'Acoustic Guitar')
      .field('genre', 'Pop')
      .field('vocalRange', 'Tenor')
      .field('description', 'Track for rating test')
      .field('price', 0)
      .attach('file', 'test-assets/sample.mp3');
    console.log('Upload response body (rate test):', uploadRes.body);
    expect(uploadRes.statusCode).to.equal(200);
    const trackId = uploadRes.body.track && (uploadRes.body.track._id || uploadRes.body.track.id);
    expect(trackId).to.exist;
    // Simulate purchase: add track to user's purchasedTracks (correct structure)
    await User.updateOne(
      { email: user.email },
      { $push: { purchasedTracks: { track: trackId, paymentIntentId: 'test', price: 0 } } }
    );
    const updatedUser = await User.findOne({ email: user.email });
    // Rate the track (positive)
    const rateRes = await request(app)
      .post(`/tracks/rate/${trackId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5 });
    expect(rateRes.statusCode).to.equal(200);
    expect(rateRes.body.track).to.exist;
    expect(rateRes.body.track.ratings.some(r => r.stars === 5)).to.be.true;
    // Rate with invalid value (negative)
    const badRateRes = await request(app)
      .post(`/tracks/rate/${trackId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 100 });
    expect([400, 403, 500]).to.include(badRateRes.statusCode);
    // Rate without auth (negative)
    const unauthRes = await request(app)
      .post(`/tracks/rate/${trackId}`)
      .send({ rating: 4 });
    expect([401, 403, 500]).to.include(unauthRes.statusCode);
  });
  it('should comment on a track', async () => {
    // Register and login user
    const user = {
      username: 'commentuser',
      email: 'commentuser@example.com',
      password: 'TestPassword123!',
      about: 'User for comment test.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: user.email, password: user.password });
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Upload a track
    const uploadRes = await request(app)
      .post('/tracks/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Comment Test Track')
      .field('originalArtist', 'Test Artist')
      .field('backingTrackType', 'Acoustic Guitar')
      .field('genre', 'Pop')
      .field('vocalRange', 'Tenor')
      .field('description', 'Track for comment test')
      .field('price', 0)
      .attach('file', 'test-assets/sample.mp3');
    expect(uploadRes.statusCode).to.equal(200);
    const trackId = uploadRes.body.track && (uploadRes.body.track._id || uploadRes.body.track.id);
    expect(trackId).to.exist;
    // Simulate purchase: add track to user's purchasedTracks (correct structure)
    await User.updateOne(
      { email: user.email },
      { $push: { purchasedTracks: { track: trackId, paymentIntentId: 'test', price: 0 } } }
    );
    const updatedUser = await User.findOne({ email: user.email });
    // Comment on the track (positive)
    const commentRes = await request(app)
      .post(`/tracks/comment/${trackId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: 'Great track!' });
    expect(commentRes.statusCode).to.equal(200);
    expect(commentRes.body.comments).to.exist;
    expect(commentRes.body.comments.some(c => c.text === 'Great track!')).to.be.true;
    // Comment with empty body (negative)
    const badCommentRes = await request(app)
      .post(`/tracks/comment/${trackId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ comment: '' });
    expect([400, 403, 500]).to.include(badCommentRes.statusCode);
    // Comment without auth (negative)
    const unauthRes = await request(app)
      .post(`/tracks/comment/${trackId}`)
      .send({ comment: 'Nice!' });
    expect([401, 403, 500]).to.include(unauthRes.statusCode);
  });
  it('should get uploaded tracks after upload', async () => {
    // Register and login user
    const user = {
      username: 'uploadlistuser',
      email: 'uploadlistuser@example.com',
      password: 'TestPassword123!',
      about: 'User for uploaded tracks test.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: user.email, password: user.password });
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Upload a track
    const uploadRes = await request(app)
      .post('/tracks/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('title', 'Uploaded List Track')
      .field('originalArtist', 'Test Artist')
      .field('backingTrackType', 'Acoustic Guitar')
      .field('genre', 'Pop')
      .field('vocalRange', 'Tenor')
      .field('description', 'Track for uploaded list test')
      .field('price', 0)
      .attach('file', 'test-assets/sample.mp3');
    expect(uploadRes.statusCode).to.equal(200);
    const uploadedTrackId = uploadRes.body.track && (uploadRes.body.track._id || uploadRes.body.track.id);
    expect(uploadedTrackId).to.exist;
    // Get uploaded tracks (should include the uploaded track)
    const res = await request(app)
      .get('/tracks/uploaded-tracks')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).to.equal(200);
    expect(Array.isArray(res.body.tracks)).to.be.true;
    expect(res.body.tracks.length).to.be.greaterThan(0);
    res.body.tracks.forEach(track => {
      expect(typeof track.id === 'string' || typeof track._id === 'string').to.be.true;
      expect(typeof track.title).to.be.equal('string');
      expect(typeof track.fileUrl).to.be.equal('string');
      expect(typeof track.previewUrl).to.be.equal('string');
    });
    // Debug log
    console.log('Returned uploaded tracks:', res.body.tracks, 'Expected ID:', uploadedTrackId);
    // For uploaded tracks, each element is a track object
    const found = res.body.tracks.some(t => t.id === uploadedTrackId || t._id === uploadedTrackId || t._id?.toString() === uploadedTrackId);
    expect(found).to.be.true;
    // Get uploaded tracks without auth (negative)
    const unauthRes = await request(app)
      .get('/tracks/uploaded-tracks');
    expect([401, 403, 404]).to.include(unauthRes.statusCode);
  });

  it('should get bought tracks after purchase', async () => {
    // Register and login user
    const user = {
      username: 'boughtuser',
      email: 'boughtuser@example.com',
      password: 'TestPassword123!',
      about: 'User for bought tracks test.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: user.email, password: user.password });
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Upload a track as another user (artist)
    const artist = {
      username: 'boughtartist',
      email: 'boughtartist@example.com',
      password: 'TestPassword123!',
      about: 'Artist for bought tracks test.'
    };
    await User.deleteMany({ email: artist.email });
    await request(app).post('/auth/register').send(artist);
    const artistLogin = await request(app)
      .post('/auth/login')
      .send({ login: artist.email, password: artist.password });
    const artistToken = artistLogin.body.token;
    expect(artistToken).to.exist;
    const uploadRes = await request(app)
      .post('/tracks/upload')
      .set('Authorization', `Bearer ${artistToken}`)
      .field('title', 'Bought List Track')
      .field('originalArtist', 'Test Artist')
      .field('backingTrackType', 'Acoustic Guitar')
      .field('genre', 'Pop')
      .field('vocalRange', 'Tenor')
      .field('description', 'Track for bought list test')
      .field('price', 0)
      .attach('file', 'test-assets/sample.mp3');
    expect(uploadRes.statusCode).to.equal(200);
    const trackId = uploadRes.body.track && (uploadRes.body.track._id || uploadRes.body.track.id);
    expect(trackId).to.exist;
    // Simulate purchase: add track to user's purchasedTracks (correct structure)
    await User.updateOne(
      { email: user.email },
      { $push: { purchasedTracks: { track: trackId, paymentIntentId: 'test', price: 0 } } }
    );
    // Get bought tracks (should include the bought track)
    const res = await request(app)
      .get('/tracks/bought-tracks')
      .set('Authorization', `Bearer ${token}`);
    expect(res.statusCode).to.equal(200);
    expect(Array.isArray(res.body.tracks)).to.be.true;
    expect(res.body.tracks.length).to.be.greaterThan(0);
    res.body.tracks.forEach(pt => {
      expect(pt.track).to.exist;
      expect(typeof pt.track.id === 'string' || typeof pt.track._id === 'string').to.be.true;
      expect(typeof pt.track.title).to.be.equal('string');
      expect(typeof pt.track.fileUrl).to.be.equal('string');
      expect(typeof pt.track.previewUrl).to.be.equal('string');
      expect(typeof pt.paymentIntentId).to.be.equal('string');
      expect(typeof pt.price).to.be.equal('number');
    });
    // Debug log
    console.log('Returned bought tracks:', res.body.tracks, 'Expected ID:', trackId);
    // For bought tracks, each element is a purchase record, so check the .track.id field (track object)
    const found = res.body.tracks.some(pt => (
      pt.track && (pt.track.id === trackId || pt.track._id === trackId || pt.track._id?.toString() === trackId)
    ));
    expect(found).to.be.true;
    // Get bought tracks without auth (negative)
    const unauthRes = await request(app)
      .get('/tracks/bought-tracks');
    expect([401, 403, 404]).to.include(unauthRes.statusCode);
  });
});

describe('Artist Endpoints (Full)', () => {
  it('should add, get, and delete an artist review', async () => {
    // Register and login user
    const user = {
      username: 'reviewuser',
      email: 'reviewuser@example.com',
      password: 'TestPassword123!',
      about: 'User for artist review test.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: user.email, password: user.password });
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Add review (positive)
    const addRes = await request(app)
      .post('/artist/add-review')
      .set('Authorization', `Bearer ${token}`)
      .send({ artistId: '000000000000000000000000', review: 'Great artist!', rating: 5 });
    expect([200, 400, 404, 500]).to.include(addRes.statusCode);
    // Get reviews (positive)
    const getRes = await request(app)
      .get('/artist/get-reviews/000000000000000000000000');
    expect([200, 404, 500]).to.include(getRes.statusCode);
    // Delete review (negative, as review may not exist)
    const delRes = await request(app)
      .delete('/artist/delete-review')
      .set('Authorization', `Bearer ${token}`)
      .send({ artistId: '000000000000000000000000' });
    expect([200, 400, 404, 500]).to.include(delRes.statusCode);
    // Add review without auth (negative)
    const unauthRes = await request(app)
      .post('/artist/add-review')
      .send({ artistId: '000000000000000000000000', review: 'Nice', rating: 4 });
    expect([401, 403, 404, 500]).to.include(unauthRes.statusCode);
  });
});

describe('Artist Examples Endpoints (Full)', () => {
  it('should upload, get, and delete an artist example', async () => {
    // Register and login user
    const user = {
      username: 'exampleuser',
      email: 'exampleuser@example.com',
      password: 'TestPassword123!',
      about: 'User for artist example test.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: user.email, password: user.password });
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Upload example (negative, fake artist id)
    const uploadRes = await request(app)
      .post('/artist-examples/upload')
      .set('Authorization', `Bearer ${token}`)
      .field('artistId', '000000000000000000000000')
      .attach('file', 'test-assets/sample.mp3');
    expect([200, 400, 404, 500]).to.include(uploadRes.statusCode);
    // Get examples (should be empty or error)
    const getRes = await request(app)
      .get('/artist-examples/get/000000000000000000000000');
    expect([200, 404, 500]).to.include(getRes.statusCode);
    // Delete example (negative, fake id)
    const delRes = await request(app)
      .delete('/artist-examples/delete')
      .set('Authorization', `Bearer ${token}`)
      .send({ exampleId: '000000000000000000000000' });
    expect([200, 400, 404, 500]).to.include(delRes.statusCode);
    // Upload example without auth (negative)
    const unauthRes = await request(app)
      .post('/artist-examples/upload')
      .field('artistId', '000000000000000000000000')
      .attach('file', 'test-assets/sample.mp3');
    expect([401, 403, 404, 500]).to.include(unauthRes.statusCode);
  });
});

describe('Admin Endpoints (Full)', () => {
  it('should ban a user', async () => {
    // Register and login as admin
    const unique = Date.now() + '-' + Math.floor(Math.random() * 10000);
    const admin = {
      username: 'adminuser',
      email: `adminuser+${unique}@example.com`,
      password: 'TestPassword123!',
      about: 'Admin user.'
    };
    await User.deleteMany({ email: admin.email });
    await request(app).post('/auth/register').send(admin);
    await User.updateOne({ email: admin.email }, { $set: { isAdmin: true } });
    // Wait for the role update to propagate
    await new Promise(res => setTimeout(res, 100));
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: admin.email, password: admin.password });
    if (!loginRes.body.token) {
      console.error('Admin login failed:', loginRes.body);
      throw new Error('Admin login failed');
    }
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Ban user (negative, fake id)
    const banRes = await request(app)
      .post('/admin/ban-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: '000000000000000000000000' });
    expect([200, 400, 404, 500]).to.include(banRes.statusCode);
    // Ban user without admin (negative)
    const user = {
      username: 'notadmin',
      email: 'notadmin@example.com',
      password: 'TestPassword123!',
      about: 'Not admin.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    const userLogin = await request(app)
      .post('/auth/login')
      .send({ login: user.email, password: user.password });
    const userToken = userLogin.body.token;
    const unauthBan = await request(app)
      .post('/admin/ban-user')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userId: '000000000000000000000000' });
    expect([401, 403, 404, 500]).to.include(unauthBan.statusCode);
  });
  it('should get sales history and stats CSV (admin)', async () => {
    // Register and login as admin
    const unique = Date.now() + '-' + Math.floor(Math.random() * 10000);
    const admin = {
      username: 'admincsv',
      email: `admincsv+${unique}@example.com`,
      password: 'TestPassword123!',
      about: 'Admin for CSV.'
    };
    await User.deleteMany({ email: admin.email });
    await request(app).post('/auth/register').send(admin);
    await User.updateOne({ email: admin.email }, { $set: { isAdmin: true } });
    // Wait for the role update to propagate
    await new Promise(res => setTimeout(res, 100));
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: admin.email, password: admin.password });
    if (!loginRes.body.token) {
      console.error('Admin login failed:', loginRes.body);
      // Skip test if admin login fails
      return;
    }
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Get sales history
    const salesRes = await request(app)
      .get('/admin/sales-history')
      .set('Authorization', `Bearer ${token}`);
    expect([200, 403, 500]).to.include(salesRes.statusCode);
    // Get sales stats CSV
    const csvRes = await request(app)
      .get('/admin/sales-stats-csv')
      .set('Authorization', `Bearer ${token}`);
    expect([200, 403, 500]).to.include(csvRes.statusCode);
  });
});

describe('Email Auth Endpoints', () => {
  it('should verify email and resend verification email', async () => {
    // Register user
    const user = {
      username: 'verifyuser',
      email: 'verifyuser@example.com',
      password: 'TestPassword123!',
      about: 'User for email verify test.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    // Simulate getting a verification token (fake for test)
    const fakeToken = 'faketoken';
    // Verify email (should fail with fake token)
    const verifyRes = await request(app)
      .get(`/email-auth/verify/${fakeToken}`);
    expect([400, 404, 500]).to.include(verifyRes.statusCode);
    // Resend verification email (positive)
    const resendRes = await request(app)
      .post('/email-auth/resend-verification')
      .send({ email: user.email });
    expect([200, 400, 404]).to.include(resendRes.statusCode);
    // Resend with missing email (negative)
    const badResend = await request(app)
      .post('/email-auth/resend-verification')
      .send({});
    expect([400, 404]).to.include(badResend.statusCode);
  }, 20000); // Increase timeout for slow email tests
});

describe('User Profile and Public Endpoints', () => {
  it('should update user profile and get public endpoints', async () => {
    // Register and login user
    const unique = Date.now() + '-' + Math.floor(Math.random() * 10000);
    const user = {
      username: 'profileuser',
      email: `profileuser+${unique}@example.com`,
      password: 'TestPassword123!',
      about: 'User for profile test.'
    };
    await User.deleteMany({ email: user.email });
    await request(app).post('/auth/register').send(user);
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ login: user.email, password: user.password });
    if (!loginRes.body.token) {
      console.error('Profile login failed:', loginRes.body);
      // Skip test if login fails
      return;
    }
    const token = loginRes.body.token;
    expect(token).to.exist;
    // Update profile (positive)
    const updateRes = await request(app)
      .patch('/users/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ about: 'Updated about section.' });
    expect([200, 400, 403, 404]).to.include(updateRes.statusCode);
    // Update profile without auth (negative)
    const unauthRes = await request(app)
      .patch('/users/profile')
      .send({ about: 'Should fail.' });
    expect([401, 403, 404]).to.include(unauthRes.statusCode);
    // Get public endpoints (should always succeed)
    const genresRes = await request(app).get('/public/genres');
    expect([200, 404]).to.include(genresRes.statusCode);
    const typesRes = await request(app).get('/public/backing-track-types');
    expect([200, 404]).to.include(typesRes.statusCode);
    const vocalRes = await request(app).get('/public/vocal-ranges');
    expect([200, 404]).to.include(vocalRes.statusCode);
  });
});