import Notification from '../models/Notifications.js';

/**
 * Notification Helper Functions
 * These functions provide easy ways to create specific types of notifications
 */

export const createFollowNotification = async (followedUserId, followerUserId, followerUsername) => {
    console.log('[NOTIFICATION DEBUG] Creating follow notification:', {
        followedUserId,
        followerUserId,
        followerUsername
    });
    
    try {
        const result = await Notification.createNotification({
            userId: followedUserId,
            type: 'follow',
            title: 'New Follower',
            message: `${followerUsername} started following you`,
            relatedUser: followerUserId
        });
        console.log('[NOTIFICATION DEBUG] Follow notification created successfully:', result);
        return result;
    } catch (error) {
        console.error('[NOTIFICATION DEBUG] Error creating follow notification:', error);
        throw error;
    }
};

export const createTrackPurchaseNotification = async (artistId, buyerUsername, trackId, trackTitle) => {
    return await Notification.createNotification({
        userId: artistId,
        type: 'track_purchase',
        title: 'Track Purchased',
        message: `${buyerUsername} purchased your track "${trackTitle}"`,
        relatedTrack: trackId,
        metadata: { buyerUsername }
    });
};

export const createCommissionRequestNotification = async (artistId, clientUserId, clientUsername, commissionId) => {
    return await Notification.createNotification({
        userId: artistId,
        type: 'commission_request',
        title: 'New Commission Request',
        message: `${clientUsername} sent you a commission request`,
        relatedCommission: commissionId,
        relatedUser: clientUserId,
        metadata: { clientUsername }
    });
};

export const createCommissionAcceptedNotification = async (clientId, artistUserId, artistUsername, commissionId) => {
    return await Notification.createNotification({
        userId: clientId,
        type: 'commission_accepted',
        title: 'Commission Accepted',
        message: `${artistUsername} accepted your commission request`,
        relatedCommission: commissionId,
        relatedUser: artistUserId,
        metadata: { artistUsername }
    });
};

export const createCommissionCompletedNotification = async (clientId, artistUserId, artistUsername, commissionId) => {
    return await Notification.createNotification({
        userId: clientId,
        type: 'commission_completed',
        title: 'Commission Completed',
        message: `${artistUsername} completed your commission`,
        relatedCommission: commissionId,
        relatedUser: artistUserId,
        metadata: { artistUsername }
    });
};

export const createCommissionDeclinedNotification = async (clientId, artistUserId, artistUsername, commissionId, reason) => {
    return await Notification.createNotification({
        userId: clientId,
        type: 'commission_declined',
        title: 'Commission Declined',
        message: `${artistUsername} declined your commission request`,
        relatedCommission: commissionId,
        relatedUser: artistUserId,
        metadata: { artistUsername, reason }
    });
};

export const createTrackUploadedNotification = async (artistId, trackId, trackTitle) => {
    return await Notification.createNotification({
        userId: artistId,
        type: 'track_uploaded',
        title: 'Track Uploaded',
        message: `Your track "${trackTitle}" has been uploaded successfully`,
        relatedTrack: trackId
    });
};

export const createTrackApprovedNotification = async (artistId, trackId, trackTitle) => {
    return await Notification.createNotification({
        userId: artistId,
        type: 'track_approved',
        title: 'Track Approved',
        message: `Your track "${trackTitle}" has been approved and is now available for purchase`,
        relatedTrack: trackId
    });
};

export const createTrackRejectedNotification = async (artistId, trackId, trackTitle, reason) => {
    return await Notification.createNotification({
        userId: artistId,
        type: 'track_rejected',
        title: 'Track Rejected',
        message: `Your track "${trackTitle}" was rejected`,
        relatedTrack: trackId,
        metadata: { reason }
    });
};

export const createPayoutProcessedNotification = async (artistId, amount, currency = 'GBP') => {
    return await Notification.createNotification({
        userId: artistId,
        type: 'payout_processed',
        title: 'Payout Processed',
        message: `Your payout of ${currency}${amount} has been processed`,
        metadata: { amount, currency }
    });
};

export const createReviewAddedNotification = async (artistId, reviewerUserId, reviewerUsername, trackId, trackTitle, rating) => {
    return await Notification.createNotification({
        userId: artistId,
        type: 'review_added',
        title: 'New Review',
        message: `${reviewerUsername} left a ${rating}-star review on "${trackTitle}"`,
        relatedTrack: trackId,
        relatedUser: reviewerUserId,
        metadata: { reviewerUsername, rating }
    });
};

export const createRatingNotification = async (artistId, raterUsername, trackId, trackTitle, rating) => {
    return await Notification.createNotification({
        userId: artistId,
        type: 'review_added',
        title: 'New Track Rating',
        message: `${raterUsername} rated your track "${trackTitle}" ${rating} star${rating !== 1 ? 's' : ''}`,
        relatedTrack: trackId,
        metadata: { raterUsername, trackTitle, rating }
    });
};

export const createSystemNotification = async (userId, title, message, metadata = {}) => {
    return await Notification.createNotification({
        userId,
        type: 'system',
        title,
        message,
        metadata
    });
};

/**
 * Bulk notification helpers for following relationships
 */
export const notifyFollowersOfNewTrack = async (artistId, trackId, trackTitle) => {
    try {
        // Import User model to get followers
        const { default: User } = await import('../models/User.js');
        
        // Get the artist to find their followers
        const artist = await User.findById(artistId).populate('followers', '_id username');
        
        if (!artist) {
            console.error('Artist not found for new track notification');
            return;
        }
        
        if (!artist.followers || artist.followers.length === 0) {
            console.log(`Artist ${artist.username} has no followers to notify about new track`);
            return;
        }
        
        console.log(`Notifying ${artist.followers.length} followers about new track "${trackTitle}" by ${artist.username}`);        // Create notifications for each follower
        const notificationPromises = artist.followers.map(follower => 
            Notification.createNotification({
                userId: follower._id || follower.id,
                type: 'track_uploaded',
                title: 'New Track Available',
                message: `${artist.username} has uploaded a new backing track: "${trackTitle}"`,
                relatedUser: artistId,
                relatedTrack: trackId,
                metadata: { 
                    artistUsername: artist.username,
                    trackTitle: trackTitle
                }
            })
        );
        
        // Execute all notifications in parallel
        await Promise.allSettled(notificationPromises);
        
        console.log(`Successfully created notifications for ${artist.followers.length} followers`);
        
    } catch (error) {
        console.error('Error notifying followers of new track:', error);
    }
};

// Helper function to create notification directly (used internally)
const createNotification = async (notificationData) => {
    const { default: Notification } = await import('../models/Notifications.js');
    return await Notification.createNotification(notificationData);
};

/**
 * Cleanup utility - can be called manually if needed
 */
export const cleanupOldNotifications = async (userId) => {
    try {
        const notificationCount = await Notification.countDocuments({ userId });
        
        if (notificationCount > 10) {
            const excessCount = notificationCount - 10;
            
            const oldestNotifications = await Notification
                .find({ userId })
                .sort({ createdAt: 1 })
                .limit(excessCount)
                .select('_id');
            
            const idsToDelete = oldestNotifications.map(n => n._id);
            
            if (idsToDelete.length > 0) {
                await Notification.deleteMany({ 
                    _id: { $in: idsToDelete } 
                });
                
                console.log(`[Manual Cleanup] Removed ${idsToDelete.length} old notifications for user ${userId}`);
                return idsToDelete.length;
            }
        }
        
        return 0;
    } catch (error) {
        console.error('Error cleaning up notifications:', error);
        throw error;
    }
};

export const createWelcomeNotification = async (userId) => {
    console.log('[NOTIFICATION DEBUG] Creating welcome notification for user:', userId);
    
    try {
        const result = await Notification.createNotification({
            userId: userId,
            type: 'welcome',
            title: 'Welcome to Acoustic Version!',
            message: 'A home for Custom Made Acoustic Backing Tracks. Click "Shop" to get started.',
            metadata: {
                isWelcome: true,
                priority: 'high'
            }
        });
        console.log('[NOTIFICATION DEBUG] Welcome notification created successfully:', result);
        return result;
    } catch (error) {
        console.error('[NOTIFICATION DEBUG] Error creating welcome notification:', error);
        throw error;
    }
};

export const createArtistWelcomeNotification = async (userId) => {
    console.log('[NOTIFICATION DEBUG] Creating artist welcome notification for user:', userId);
    
    try {
        const result = await Notification.createNotification({
            userId: userId,
            type: 'artist_welcome',
            title: 'Welcome to Our Artist Team!',
            message: 'Thanks for wanting to be a part of our team. To get started with your application, please go to "Artist Examples" in the artist dashboard section and upload some examples of your playing. If your profile is approved, you can then head to "Track Management" to upload your licensed tracks. Otherwise, if you have no tracks, feel free to head to "Artist Settings" and tick the box to make yourself available for commissions!',
            metadata: {
                isArtistWelcome: true,
                priority: 'high'
            }
        });
        console.log('[NOTIFICATION DEBUG] Artist welcome notification created successfully:', result);
        return result;
    } catch (error) {
        console.error('[NOTIFICATION DEBUG] Error creating artist welcome notification:', error);
        throw error;
    }
};

export const createArtistApprovedNotification = async (userId) => {
    return await Notification.createNotification({
        userId: userId,
        type: 'artist_approved',
        title: 'You have been approved!',
        message: 'Congratulations, you are now a member of our team.',
        metadata: {
            isArtistApproval: true,
            priority: 'high'
        }
    });
};

export const createArtistRejectedNotification = async (userId) => {
    return await Notification.createNotification({
        userId: userId,
        type: 'artist_rejected',
        title: 'Application Update',
        message: 'Unfortunately we have had to reject your application to be part of our team. Please do not be offended as it likely has nothing to do with your ability, and most likely is down to the specific vision we have for our platform. If you have any questions or you think it was a mistake, please fill out the contact us form.',
        metadata: {
            isArtistRejection: true,
            priority: 'high'
        }
    });
};

export const createFirstUploadCongratulationsNotification = async (userId) => {
    return await Notification.createNotification({
        userId: userId,
        type: 'first_upload_congratulations',
        title: 'Congratulations on your first upload!',
        message: 'Congratulations on your first upload! If you haven\'t already, make sure you fill out as many of the track details as you can. They help me optimize SEO and push your track as far as it can go!',
        metadata: {
            isFirstUpload: true,
            priority: 'medium'
        }
    });
};

export const createCommissionInProgressNotification = async (artistId, commissionId) => {
    return await Notification.createNotification({
        userId: artistId,
        type: 'commission_in_progress',
        title: 'Commission In Progress',
        message: 'Customer has paid the platform and the commission process has begun. Please proceed with recording and uploading your track.',
        relatedCommission: commissionId
    });
};

export const createTrackTakedownNotification = async (artistId, trackId, trackTitle, reason) => {
    return await Notification.createNotification({
        userId: artistId,
        type: 'track_takedown',
        title: 'Track Taken Down',
        message: `Your track "${trackTitle}" has been taken down due to a copyright complaint or DMCA notice.`,
        relatedTrack: trackId,
        metadata: { reason }
    });
};
