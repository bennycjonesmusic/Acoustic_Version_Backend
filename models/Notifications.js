import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import adminEmails from '../utils/admins.js';

const notificationsSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true // Index for faster queries by user
    },    type: {
        type: String,
        enum: [
            // Core user interactions
            'follow', 
            'unfollow',
            
            // Track-related notifications
            'track_purchase', 
            'track_uploaded',
            'track_upload',  // frontend uses this variant too
            'track_approved',
            'track_rejected',
            
            // Commission-related notifications
            'commission_request', 
            'commission_accepted', 
            'commission_completed', 
            'commission_declined',
            
            // Welcome/onboarding notifications
            'welcome',
            'artist_welcome',
            
            // Artist management notifications
            'artist_approved',
            'artist_rejected',
            
            // Achievement notifications
            'first_upload_congratulations',
            
            // System notifications
            'payout_processed',
            'review_added',
            'system'
        ],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    // Related entity information
    relatedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    relatedTrack: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BackingTrack'
    },
    relatedCommission: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CommissionRequest'
    },
    // Additional data for the notification
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    read: {
        type: Boolean,
        default: false,
        index: true // Index for filtering read/unread
    },
    readAt: {
        type: Date
    },
    createdAt: {
        type: Date,
        default: Date.now,
        index: true // Index for sorting by date
    }
}, {
    timestamps: true
});

// Compound index for efficient queries
notificationsSchema.index({ userId: 1, createdAt: -1 });
notificationsSchema.index({ userId: 1, read: 1 });

// Pre-save middleware to automatically clean up old notifications
notificationsSchema.pre('save', async function() {
    // Only run cleanup for new notifications
    if (this.isNew) {
        const userId = this.userId;
        
        // Count total notifications for this user
        const notificationCount = await this.constructor.countDocuments({ userId });
        
        // If we'll exceed 10 notifications after saving this one, delete the oldest
        if (notificationCount >= 10) {
            const excessCount = notificationCount - 9; // Keep 9, so with the new one we'll have 10
            
            // Find the oldest notifications to delete
            const oldestNotifications = await this.constructor
                .find({ userId })
                .sort({ createdAt: 1 }) // Oldest first
                .limit(excessCount)
                .select('_id');
            
            const idsToDelete = oldestNotifications.map(n => n._id);
            
            if (idsToDelete.length > 0) {
                await this.constructor.deleteMany({ 
                    _id: { $in: idsToDelete } 
                });
                
                console.log(`[Notifications] Cleaned up ${idsToDelete.length} old notifications for user ${userId}`);
            }
        }
    }
});

// Static method to create notification with automatic cleanup and duplicate prevention
notificationsSchema.statics.createNotification = async function(notificationData) {
    console.log('[NOTIFICATION MODEL DEBUG] Creating notification with data:', notificationData);
    
    try {
        // Check for duplicate notifications within the last 5 minutes
        const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
        const duplicateQuery = {
            userId: notificationData.userId,
            type: notificationData.type,
            createdAt: { $gte: fiveMinutesAgo }
        };
        
        // If it's a commission-related notification, also check commissionId
        if (notificationData.commissionId) {
            duplicateQuery.commissionId = notificationData.commissionId;
        }
        
        const existingNotification = await this.findOne(duplicateQuery);
        
        if (existingNotification) {
            console.log('[NOTIFICATION MODEL DEBUG] Duplicate notification prevented:', duplicateQuery);
            return existingNotification; // Return existing instead of creating new
        }
        
        const notification = new this(notificationData);
        console.log('[NOTIFICATION MODEL DEBUG] Notification object created:', notification);
        
        await notification.save();
        console.log('[NOTIFICATION MODEL DEBUG] Notification saved successfully:', notification);
        
        return notification;
    } catch (error) {
        console.error('[NOTIFICATION MODEL DEBUG] Error creating notification:', error);
        throw error;
    }
};

// Static method to mark notification as read
notificationsSchema.statics.markAsRead = async function(notificationId, userId) {
    return await this.findOneAndUpdate(
        { _id: notificationId, userId },
        { 
            read: true, 
            readAt: new Date() 
        },
        { new: true }
    );
};

// Static method to mark all notifications as read for a user
notificationsSchema.statics.markAllAsRead = async function(userId) {
    return await this.updateMany(
        { userId, read: false },
        { 
            read: true, 
            readAt: new Date() 
        }
    );
};

// Static method to get unread count for a user
notificationsSchema.statics.getUnreadCount = async function(userId) {
    return await this.countDocuments({ userId, read: false });
};

// Static method to get paginated notifications for a user
notificationsSchema.statics.getUserNotifications = async function(userId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;
    
    const notifications = await this.find({ userId })
        .populate('relatedUser', 'username avatar')
        .populate('relatedTrack', 'title')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    
    const total = await this.countDocuments({ userId });
    const unreadCount = await this.getUnreadCount(userId);
    
    return {
        notifications,
        pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        },
        unreadCount
    };
};

// Production performance indexes
notificationsSchema.index({ 
  userId: 1, 
  read: 1, 
  createdAt: -1 
}, { name: 'user_notifications_compound' }); // Optimized user notification queries

const Notification = mongoose.model('Notification', notificationsSchema);
export default Notification;