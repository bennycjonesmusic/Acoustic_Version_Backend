// Public get all track IDs (for sitemap, etc)
import { getAllIds } from '../controllers/tracksController.js';

// ...existing code...

// Public route to get all track IDs

import express from 'express';
import { searchTracks, queryTracks, queryUsers, getTrack, getFeaturedTracks, getFeaturedArtists, searchUserByName, getUserDetails, getLicenseInformation } from '../controllers/publicController.js';
import publicMiddleware from '../middleware/public_auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = express.Router();

// Public track search
router.get('/tracks/search', publicMiddleware, searchTracks);

// Public track query (with filters, pagination, etc)
router.get('/tracks/query', publicMiddleware, queryTracks);

router.get('/users/query', publicMiddleware, queryUsers);

// Log asyncHandler type and route registration for diagnostics
console.log('[ROUTE] asyncHandler type:', typeof asyncHandler);
console.log('[ROUTE] Registering /public/tracks/featured');

// Public get featured tracks
router.get('/tracks/featured', publicMiddleware, asyncHandler(getFeaturedTracks));


// Public get all track IDs (for sitemap, etc)
router.get('/all-ids', publicMiddleware, getAllIds);

// Public get single track by id
router.get('/tracks/:id', publicMiddleware, getTrack);

// Public get featured artists
router.get('/artists/featured', publicMiddleware, asyncHandler(getFeaturedArtists));

// Public search user by name
router.get('/users/search', publicMiddleware, searchUserByName);

// Public get user details by id
router.get('/users/:id', publicMiddleware, getUserDetails);


// Public get license information for a track
router.get('/tracks/:trackId/license-info', publicMiddleware, asyncHandler(getLicenseInformation));

export default router;
