import express from 'express';
import { 
  createCommissionRequest, 
  approveCommissionAndPayout, 
  processExpiredCommissions,
  uploadFinishedTrack,
  confirmOrDenyCommission,
  refundCommission,
  refundTrackPurchase
} from '../controllers/commissionControl.js';
import { downloadCommissionFile } from '../controllers/commissionDownloadController.js';
import authMiddleware from '../middleware/customer_auth.js';
import artistAuth from '../middleware/artist_auth.js';
import adminAuth from '../middleware/Admin.js';
import upload from '../middleware/song_upload.js';

const router = express.Router();

// Create a new commission request (customer only)
router.post('/request', authMiddleware, createCommissionRequest);

// Approve commission and pay out artist (customer or admin)
router.post('/approve', authMiddleware, approveCommissionAndPayout);
router.post('/admin/approve', authMiddleware, adminAuth, approveCommissionAndPayout);

// Process expired commissions and refund (admin only, can be called by cron or manually)
router.post('/process-expired', authMiddleware, adminAuth, processExpiredCommissions);

// Artist uploads finished track for commission (audio file)
router.post('/upload-finished', authMiddleware, upload.single('file'), uploadFinishedTrack);

// Customer confirms or denies preview
router.post('/confirm', authMiddleware, confirmOrDenyCommission);

// Download finished or preview commission file (customer or admin only)
router.get('/download', authMiddleware, downloadCommissionFile);

// Admin-only: Issue a refund for a regular track purchase (not commission)
router.post('/admin/track-refund', adminAuth, refundTrackPurchase);

// Admin-only: Issue a refund for a commission
router.post('/admin/refund', adminAuth, refundCommission);

export default router;
