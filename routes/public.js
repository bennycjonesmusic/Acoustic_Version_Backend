import express from 'express';
import { searchTracks, queryTracks, getTrack } from '../controllers/publicController.js';
import publicAuth from '../middleware/public_auth.js';

const router = express.Router();

// Public track search
router.get('/tracks/search', searchTracks);

// Public track query (with filters, pagination, etc)
router.get('/tracks/query', queryTracks);

// Public get single track by id
router.get('/tracks/:id', publicAuth, getTrack);

export default router;
