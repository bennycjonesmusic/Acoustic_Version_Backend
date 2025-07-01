import { Router } from 'express';
import authMiddleware from '../middleware/customer_auth.js';
import isAdmin from '../middleware/Admin.js';
import { clearS3, deleteAllUsers, getUsers, banUser, getAllSalesAndRefunds, getSalesStatsAndCsv, getAllArtistsForApproval, approveArtist, rejectArtist, deleteUserByEmail, getWebsiteAnalytics, getDisputedCommissions } from '../controllers/adminController.js';
import { refundCommission } from '../controllers/commissionControl.js';

const router = Router();

router.delete('/clear-s3', authMiddleware, isAdmin, clearS3);
router.delete('/delete-all-users', authMiddleware, isAdmin, deleteAllUsers); //delete all users now requires special admin code
router.get('/users', authMiddleware, isAdmin, getUsers);
router.post('/ban-user', authMiddleware, isAdmin, banUser);
router.get('/sales-history', authMiddleware, isAdmin, getAllSalesAndRefunds);
router.get('/sales-stats-csv', authMiddleware, isAdmin, getSalesStatsAndCsv);
router.get('/artists-for-approval', authMiddleware, isAdmin, getAllArtistsForApproval);
router.post('/approve-artist/:id', authMiddleware, isAdmin, approveArtist);
router.post('/reject-artist/:id', authMiddleware, isAdmin, rejectArtist);


router.delete('/test-delete-user', authMiddleware, isAdmin, deleteUserByEmail);
router.get('/website-analytics', authMiddleware, isAdmin, getWebsiteAnalytics);
router.get('/disputed-commissions', authMiddleware, isAdmin, getDisputedCommissions);
// Admin-only: Issue a refund for a commission (for admin dashboard proxy)
router.post('/refund-commission', authMiddleware, isAdmin, refundCommission);


export default router;