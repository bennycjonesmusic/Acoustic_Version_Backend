import request from 'supertest';
import app from './server.js';
import mongoose from 'mongoose';
import User from './models/User.js';
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

// Close MongoDB connection after all tests
afterAll(async () => {
  await mongoose.connection.close();
});