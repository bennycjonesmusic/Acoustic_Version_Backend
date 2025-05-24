import express from 'express';
import { searchTracks, queryTracks, getTrack, getFeaturedTracks, getFeaturedArtists, searchUserByName, getUserDetails } from '../controllers/publicController.js';
import publicAuth from '../middleware/public_auth.js';

const router = express.Router();

// Public track search
router.get('/tracks/search', searchTracks);

// Public track query (with filters, pagination, etc)
router.get('/tracks/query', queryTracks);

// Public get single track by id
router.get('/tracks/:id', publicAuth, getTrack);

// Public get featured tracks
router.get('/tracks/featured', getFeaturedTracks);

// Public get featured artists
router.get('/artists/featured', getFeaturedArtists);

// Public search user by name
router.get('/users/search', searchUserByName);

// Public get user details by id
router.get('/users/:id', getUserDetails);

export default router;
