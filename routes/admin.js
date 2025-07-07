import { Router } from 'express';
import authMiddleware from '../middleware/customer_auth.js';
import isAdmin from '../middleware/Admin.js';
import { clearS3, deleteAllUsers, getUsers, banUser, unbanUser, getAllSalesAndRefunds, getSalesStatsAndCsv, getAllArtistsForApproval, approveArtist, rejectArtist, deleteUserByEmail, getWebsiteAnalytics, getDisputedCommissions, clearCancelledCommissions } from '../controllers/adminController.js';
import { getRecentErrors, getErrorStats } from '../utils/errorLogger.js';
import { refundCommission } from '../controllers/commissionControl.js';

const router = Router();

router.delete('/clear-s3', authMiddleware, isAdmin, clearS3);
router.delete('/delete-all-users', authMiddleware, isAdmin, deleteAllUsers); //delete all users now requires special admin code
router.get('/users', authMiddleware, isAdmin, getUsers);
router.post('/ban-user', authMiddleware, isAdmin, banUser);
router.post('/unban-user', authMiddleware, isAdmin, unbanUser);
router.get('/sales-history', authMiddleware, isAdmin, getAllSalesAndRefunds);
router.get('/sales-stats-csv', authMiddleware, isAdmin, getSalesStatsAndCsv);
router.get('/artists-for-approval', authMiddleware, isAdmin, getAllArtistsForApproval);
router.post('/approve-artist/:id', authMiddleware, isAdmin, approveArtist);
router.post('/reject-artist/:id', authMiddleware, isAdmin, rejectArtist);


router.delete('/test-delete-user', authMiddleware, isAdmin, deleteUserByEmail);
router.get('/website-analytics', authMiddleware, isAdmin, getWebsiteAnalytics);
router.get('/disputed-commissions', authMiddleware, isAdmin, getDisputedCommissions);
// Admin-only: Clear all cancelled commissions
router.delete('/clear-cancelled-commissions', authMiddleware, isAdmin, clearCancelledCommissions);
// Admin-only: Issue a refund for a commission (for admin dashboard proxy)
router.post('/refund-commission', authMiddleware, isAdmin, refundCommission);

// Admin-only: Get recent errors for monitoring
router.get('/errors', authMiddleware, isAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const errorLog = await getRecentErrors(limit);
    res.status(200).json({ errorLog, success: true });
  } catch (error) {
    console.error('Error fetching recent errors:', error);
    res.status(500).json({ message: 'Failed to fetch errors', success: false });
  }
});

// Admin-only: Get error statistics
router.get('/error-stats', authMiddleware, isAdmin, async (req, res) => {
  try {
    const stats = await getErrorStats();
    res.status(200).json({ stats, success: true });
  } catch (error) {
    console.error('Error fetching error statistics:', error);
    res.status(500).json({ message: 'Failed to fetch error statistics', success: false });
  }
});

export default router;