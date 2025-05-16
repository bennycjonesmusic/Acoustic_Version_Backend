import { Router } from 'express';
import authMiddleware from '../middleware/customer_auth.js';
import { clearS3, deleteAllUsers, getUsers } from '../controllers/adminController.js';

const router = Router();

router.delete('/clear-s3', authMiddleware, clearS3);
router.delete('/delete-all-users', deleteAllUsers);
router.get('/users', getUsers);

export default router;