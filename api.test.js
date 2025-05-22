import request from 'supertest';
import app from './server.js';
import mongoose from 'mongoose';
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

// Close MongoDB connection after all tests
afterAll(async () => {
  await mongoose.connection.close();
});