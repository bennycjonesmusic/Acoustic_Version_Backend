import express from 'express';
import { 
  createCommissionRequest, 
  approveCommissionAndPayout, 
  processExpiredCommissions,
  uploadFinishedTrack,
  confirmOrDenyCommission
} from '../controllers/commissionControl.js';
import customerAuth from '../middleware/customer_auth.js';
import artistAuth from '../middleware/artist_auth.js';
import adminAuth from '../middleware/Admin.js';
import upload from '../middleware/song_upload.js';

const router = express.Router();

// Create a new commission request (customer only)
router.post('/request', customerAuth, createCommissionRequest);

// Approve commission and pay out artist (customer or admin)
router.post('/approve', customerAuth, approveCommissionAndPayout);
router.post('/admin/approve', adminAuth, approveCommissionAndPayout);

// Process expired commissions and refund (admin only, can be called by cron or manually)
router.post('/process-expired', adminAuth, processExpiredCommissions);

// Artist uploads finished track for commission (audio file)
router.post('/upload-finished', artistAuth, upload.single('audio'), uploadFinishedTrack);

// Customer confirms or denies preview
router.post('/confirm', customerAuth, confirmOrDenyCommission);

export default router;
