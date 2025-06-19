import express from 'express';
import authMiddleware from '../middleware/customer_auth.js';
import {
    getUserNotifications,
    getUnreadCount,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    deleteNotification,
    deleteAllNotifications
} from '../controllers/notificationsController.js';

const router = express.Router();

// All notification routes require authentication
router.use(authMiddleware);

/**
 * @route GET /notifications
 * @desc Get paginated notifications for authenticated user
 * @query page - Page number (default: 1)
 * @query limit - Items per page (default: 10, max: 50)
 */
router.get('/', getUserNotifications);

/**
 * @route GET /notifications/unread-count
 * @desc Get count of unread notifications for authenticated user
 */
router.get('/unread-count', getUnreadCount);

/**
 * @route PUT /notifications/:id/read
 * @desc Mark a specific notification as read
 * @param id - Notification ID
 */
router.put('/:id/read', markNotificationAsRead);

/**
 * @route PUT /notifications/mark-all-read
 * @desc Mark all notifications as read for authenticated user
 */
router.put('/mark-all-read', markAllNotificationsAsRead);

/**
 * @route DELETE /notifications/:id
 * @desc Delete a specific notification
 * @param id - Notification ID
 */
router.delete('/:id', deleteNotification);

/**
 * @route DELETE /notifications
 * @desc Delete all notifications for authenticated user
 */
router.delete('/', deleteAllNotifications);

export default router;
