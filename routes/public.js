import express from 'express';
import { searchTracks, queryTracks, getTrack, getFeaturedTracks, getFeaturedArtists, searchUserByName, getUserDetails } from '../controllers/publicController.js';
import publicMiddleware from '../middleware/public_auth.js';

const router = express.Router();

// Public track search
router.get('/tracks/search', publicMiddleware, searchTracks);

// Public track query (with filters, pagination, etc)
router.get('/tracks/query', publicMiddleware, queryTracks);

// Public get single track by id
router.get('/tracks/:id', publicMiddleware, getTrack);

// Public get featured tracks
router.get('/tracks/featured', publicMiddleware, getFeaturedTracks);

// Public get featured artists
router.get('/artists/featured', publicMiddleware, getFeaturedArtists);

// Public search user by name
router.get('/users/search', publicMiddleware, searchUserByName);

// Public get user details by id
router.get('/users/:id', publicMiddleware, getUserDetails);

export default router;
