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
import customerAuth from '../middleware/customer_auth.js';
import artistAuth from '../middleware/artist_auth.js';
import adminAuth from '../middleware/Admin.js';
import upload from '../middleware/song_upload.js';

const router = express.Router();

// Create a new commission request (customer only)
router.post('/request', customerAuth, createCommissionRequest);

// Approve commission and pay out artist (customer or admin)
router.post('/approve', customerAuth, approveCommissionAndPayout);
router.post('/admin/approve', customerAuth, adminAuth, approveCommissionAndPayout);

// Process expired commissions and refund (admin only, can be called by cron or manually)
router.post('/process-expired', customerAuth, adminAuth, processExpiredCommissions);

// Artist uploads finished track for commission (audio file)
router.post('/upload-finished', customerAuth, upload.single('file'), uploadFinishedTrack);

// Customer confirms or denies preview
router.post('/confirm', customerAuth, confirmOrDenyCommission);

// Download finished or preview commission file (customer or admin only)
router.get('/download', customerAuth, downloadCommissionFile);

// Admin-only: Issue a refund for a regular track purchase (not commission)
router.post('/admin/track-refund', adminAuth, refundTrackPurchase);

// Admin-only: Issue a refund for a commission
router.post('/admin/refund', adminAuth, refundCommission);

export default router;
