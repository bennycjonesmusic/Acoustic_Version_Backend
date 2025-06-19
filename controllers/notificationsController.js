import Notification from '../models/Notifications.js';

/**
 * Get notifications for the authenticated user
 * @param {Express.Request} req - Express request with user ID from auth middleware
 * @param {Express.Response} res - Express response
 */
export const getUserNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        
        // Validate pagination
        if (page < 1 || limit < 1 || limit > 50) {
            return res.status(400).json({ 
                message: "Invalid pagination parameters" 
            });
        }
        
        const result = await Notification.getUserNotifications(userId, page, limit);
        
        return res.status(200).json({
            success: true,
            data: result.notifications,
            pagination: result.pagination,
            unreadCount: result.unreadCount
        });
        
    } catch (error) {
        console.error('Error fetching user notifications:', error);
        return res.status(500).json({ 
            message: "Internal server error" 
        });
    }
};

/**
 * Get unread notification count for the authenticated user
 * @param {Express.Request} req - Express request with user ID from auth middleware
 * @param {Express.Response} res - Express response
 */
export const getUnreadCount = async (req, res) => {
    try {
        const userId = req.userId;
        const unreadCount = await Notification.getUnreadCount(userId);
        
        return res.status(200).json({
            success: true,
            unreadCount
        });
        
    } catch (error) {
        console.error('Error fetching unread count:', error);
        return res.status(500).json({ 
            message: "Internal server error" 
        });
    }
};

/**
 * Mark a specific notification as read
 * @param {Express.Request} req - Express request with notification ID in params
 * @param {Express.Response} res - Express response
 */
export const markNotificationAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        const notificationId = req.params.id;
        
        if (!notificationId) {
            return res.status(400).json({ 
                message: "Notification ID is required" 
            });
        }
        
        const notification = await Notification.markAsRead(notificationId, userId);
        
        if (!notification) {
            return res.status(404).json({ 
                message: "Notification not found or doesn't belong to user" 
            });
        }
        
        return res.status(200).json({
            success: true,
            message: "Notification marked as read",
            data: notification
        });
        
    } catch (error) {
        console.error('Error marking notification as read:', error);
        return res.status(500).json({ 
            message: "Internal server error" 
        });
    }
};

/**
 * Mark all notifications as read for the authenticated user
 * @param {Express.Request} req - Express request with user ID from auth middleware
 * @param {Express.Response} res - Express response
 */
export const markAllNotificationsAsRead = async (req, res) => {
    try {
        const userId = req.userId;
        
        const result = await Notification.markAllAsRead(userId);
        
        return res.status(200).json({
            success: true,
            message: `Marked ${result.modifiedCount} notifications as read`
        });
        
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        return res.status(500).json({ 
            message: "Internal server error" 
        });
    }
};

/**
 * Delete a specific notification
 * @param {Express.Request} req - Express request with notification ID in params
 * @param {Express.Response} res - Express response
 */
export const deleteNotification = async (req, res) => {
    try {
        const userId = req.userId;
        const notificationId = req.params.id;
        
        if (!notificationId) {
            return res.status(400).json({ 
                message: "Notification ID is required" 
            });
        }
        
        const notification = await Notification.findOneAndDelete({
            _id: notificationId,
            userId: userId
        });
        
        if (!notification) {
            return res.status(404).json({ 
                message: "Notification not found or doesn't belong to user" 
            });
        }
        
        return res.status(200).json({
            success: true,
            message: "Notification deleted successfully"
        });
        
    } catch (error) {
        console.error('Error deleting notification:', error);
        return res.status(500).json({ 
            message: "Internal server error" 
        });
    }
};

/**
 * Delete all notifications for the authenticated user
 * @param {Express.Request} req - Express request with user ID from auth middleware
 * @param {Express.Response} res - Express response
 */
export const deleteAllNotifications = async (req, res) => {
    try {
        const userId = req.userId;
        
        const result = await Notification.deleteMany({ userId });
        
        return res.status(200).json({
            success: true,
            message: `Deleted ${result.deletedCount} notifications`
        });
        
    } catch (error) {
        console.error('Error deleting all notifications:', error);
        return res.status(500).json({ 
            message: "Internal server error" 
        });
    }
};
