import express from 'express';
import {
  flagTrack,
  getFlagsForTrack,
  deleteFlag,
  reviewFlag,
  getAllFlags,
  adminTakedownTrack
} from '../controllers/flagController.js';
import authMiddleware from '../middleware/customer_auth.js';
import isAdmin from '../middleware/Admin.js';

const router = express.Router();

// Flag a track (POST)
router.post('/track/:trackId', authMiddleware, flagTrack);

// Get all flags for a track (GET, admin only)
router.get('/track/:trackId', authMiddleware, isAdmin, getFlagsForTrack);

// Delete a flag (DELETE, admin only)
router.delete('/:flagId', authMiddleware, isAdmin, deleteFlag);

// Review a flag (PATCH, admin only)
router.patch('/:flagId/review', authMiddleware, isAdmin, reviewFlag);

// Admin: get all flags for all tracks
router.get('/', authMiddleware, isAdmin, getAllFlags);

// Admin: takedown a track (copyright)
router.post('/takedown/:trackId', authMiddleware, isAdmin, adminTakedownTrack);

export default router;
