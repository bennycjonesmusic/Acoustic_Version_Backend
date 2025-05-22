import { Router } from 'express';
import authMiddleware from '../middleware/customer_auth.js';
import isOwner from '../middleware/isOwner.js';
import { clearS3, deleteAllUsers, getUsers } from '../controllers/adminController.js';

const router = Router();

router.delete('/clear-s3', authMiddleware, isOwner, clearS3);
router.delete('/delete-all-users', authMiddleware, isOwner, deleteAllUsers);
router.get('/users', getUsers);

export default router;