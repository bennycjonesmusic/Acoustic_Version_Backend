import { Router } from 'express';
import authMiddleware from '../middleware/customer_auth.js';
import isOwner from '../middleware/isOwner.js';
import { clearS3, deleteAllUsers, getUsers, banUser, getAllSalesAndRefunds, getSalesStatsAndCsv } from '../controllers/adminController.js';

const router = Router();

router.delete('/clear-s3', authMiddleware, isOwner, clearS3);
router.delete('/delete-all-users', authMiddleware, isOwner, deleteAllUsers); //delete all users now requires special admin code
router.get('/users', getUsers);
router.post('/ban-user', authMiddleware, banUser);
router.get('/sales-history', authMiddleware, getAllSalesAndRefunds);
router.get('/sales-stats-csv', authMiddleware, getSalesStatsAndCsv);

export default router;