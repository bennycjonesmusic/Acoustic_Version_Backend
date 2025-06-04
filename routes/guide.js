import express from 'express';
import upload from '../middleware/song_upload.js';
import authMiddleware from '../middleware/customer_auth.js';
import { uploadLimiter, downloadLimiter } from '../middleware/rate_limiter.js';

import {
    uploadGuideTrack,
    downloadGuideTrack,
    deleteGuideTrack
} from '../controllers/guideController.js';

const router = express.Router();

// Upload a guide track for an existing backing track
router.post('/guide/:id/upload', uploadLimiter, authMiddleware, upload.single('file'), uploadGuideTrack);

// Download a guide track (only for purchasers and track owners)
router.get('/guide/:id/download', downloadLimiter, authMiddleware, downloadGuideTrack);

// Delete a guide track from an existing backing track
router.delete('/guide/:id', authMiddleware, deleteGuideTrack);

export default router;
