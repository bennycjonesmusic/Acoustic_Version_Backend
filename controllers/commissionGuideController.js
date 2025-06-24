import fs from 'fs';
import path from 'path';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import CommissionRequest from '../models/CommissionRequest.js';
import User from '../models/User.js';
import { sanitizeFileName } from '../utils/regexSanitizer.js';
import * as Filter from 'bad-words';

/**
 * @typedef {Object} CommissionGuideTrackResponse
 * @property {string} message - Response message
 * @property {string} guideTrackForSingerUrl - URL of the uploaded guide track or YouTube link
 * @property {string} [error] - Error message if operation failed
 */

/**
 * Upload or set a guide track for singers for a commission
 * @param {Express.Request & {userId: string, params: {id: string}, file?: Express.Multer.File, body: {youtubeUrl?: string}}} req - Express request with auth, commission ID, and file or YouTube URL
 * @param {Express.Response} res - Express response
 * @returns {Promise<CommissionGuideTrackResponse>} Promise resolving to API response with guide track URL
 */
export const setCommissionGuideTrackForSinger = async (req, res) => {
    try {
        const commissionId = req.params.id;
        const { youtubeUrl } = req.body;
        const profanity = new Filter.Filter();

        // Validate commission ID
        if (!commissionId || commissionId === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(commissionId)) {
            return res.status(400).json({ message: "A valid Commission ID is required." });
        }

        // Check if either file or YouTube URL is provided, but not both
        if (req.file && youtubeUrl) {
            return res.status(400).json({ message: 'Please provide either a file upload or YouTube URL, not both.' });
        }

        if (!req.file && !youtubeUrl) {
            return res.status(400).json({ message: 'Please provide either a guide track file or YouTube URL.' });
        }

        // Find the commission
        const commission = await CommissionRequest.findById(commissionId);
        if (!commission) {
            return res.status(404).json({ message: "Commission not found." });
        }

        // Find the user
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check authorization - only the artist assigned to this commission can set guide tracks
        if (commission.artist.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                message: "You are not authorized to set guide tracks for this commission. Only the assigned artist can set guide tracks." 
            });
        }

        // Check commission status - should be in progress or delivered
        if (!['in_progress', 'delivered', 'completed', 'cron_pending', 'approved'].includes(commission.status)) {
            return res.status(400).json({ 
                message: "Guide tracks can only be set for commissions that are in progress or delivered." 
            });
        }

        let guideTrackForSingerUrl = '';

        if (youtubeUrl) {
            // Validate YouTube URL
            const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/;
            if (!youtubeRegex.test(youtubeUrl)) {
                return res.status(400).json({ message: 'Invalid YouTube URL format.' });
            }

            // Profanity check on YouTube URL
            if (profanity.isProfane(youtubeUrl)) {
                return res.status(400).json({ 
                    message: "Please avoid using inappropriate language in the YouTube URL." 
                });
            }

            guideTrackForSingerUrl = youtubeUrl;
        } else {
            // Handle file upload
            // Validate file type (MP3 files only)
            const allowedMimeTypes = [
                'audio/mpeg', 'audio/mp3'
            ];
            
            if (!allowedMimeTypes.includes(req.file.mimetype)) {
                return res.status(400).json({ 
                    message: 'Invalid file type. Please upload an MP3 file only.' 
                });
            }

            // Check file size (max 50MB for guide tracks)
            const maxFileSize = 50 * 1024 * 1024; // 50MB
            if (req.file.size > maxFileSize) {
                return res.status(400).json({ 
                    message: 'File too large. Guide tracks must be under 50MB.' 
                });
            }

            // Profanity check on file name
            if (profanity.isProfane(req.file.originalname)) {
                return res.status(400).json({ 
                    message: "Please avoid using inappropriate language in the file name." 
                });
            }

            // Sanitize file name
            const sanitizedFileName = sanitizeFileName(req.file.originalname);
            
            // Create temporary file
            const tmp = await import('os');
            const tmpDir = tmp.tmpdir();
            const tempFilePath = path.join(tmpDir, `commission_guide_${Date.now()}_${sanitizedFileName}`);
            fs.writeFileSync(tempFilePath, req.file.buffer);

            // Configure S3 client
            const s3Client = new S3Client({
                region: process.env.AWS_REGION,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                },
            });

            // If commission already has a guide track file (not YouTube), delete the old one from S3
            if (commission.guideTrackForSingerUrl && !commission.guideTrackForSingerUrl.includes('youtube')) {
                try {
                    const url = new URL(commission.guideTrackForSingerUrl);
                    const keyMatch = url.pathname.match(/^\/?(.+)/);
                    const oldKey = keyMatch ? keyMatch[1] : null;
                    
                    if (oldKey) {
                        await s3Client.send(new DeleteObjectCommand({
                            Bucket: process.env.AWS_BUCKET_NAME,
                            Key: oldKey,
                        }));
                        console.log('Deleted old commission guide track from S3:', oldKey);
                    }
                } catch (err) {
                    console.error('Error deleting old commission guide track from S3:', err);
                    // Don't fail the upload if old file deletion fails
                }
            }

            // Upload to S3 with private access
            const uploadParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `commission-guide-tracks/${Date.now()}-${sanitizedFileName}`,
                Body: fs.createReadStream(tempFilePath),
                StorageClass: 'STANDARD',
                ContentType: req.file.mimetype,
                ACL: 'private' // Private - only accessible to commission participants
            };

            const data = await new Upload({ client: s3Client, params: uploadParams }).done();
            
            // Clean up temp file
            fs.unlinkSync(tempFilePath);

            guideTrackForSingerUrl = data.Location;
        }

        // Update the commission with the new guide track URL
        commission.guideTrackForSingerUrl = guideTrackForSingerUrl;
        await commission.save();

        console.log('Commission guide track set successfully:', {
            commissionId: commission._id,
            guideTrackForSingerUrl: guideTrackForSingerUrl,
            userId: req.userId,
            type: youtubeUrl ? 'youtube' : 'file'
        });

        return res.status(200).json({ 
            message: youtubeUrl ? 'YouTube guide track set successfully!' : 'Guide track uploaded successfully!',
            guideTrackForSingerUrl: guideTrackForSingerUrl
        });

    } catch (error) {
        console.error('Error setting commission guide track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Download a commission guide track (only for commission participants)
 * @param {Express.Request & {userId: string, params: {id: string}}} req - Express request with auth and commission ID
 * @param {Express.Response} res - Express response
 * @returns {Promise<void>} Promise resolving to file stream or redirect
 */
export const downloadCommissionGuideTrack = async (req, res) => {
    try {
        const commissionId = req.params.id;

        // Validate commission ID
        if (!commissionId || commissionId === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(commissionId)) {
            return res.status(400).json({ message: "A valid Commission ID is required." });
        }

        // Find the commission
        const commission = await CommissionRequest.findById(commissionId);
        if (!commission) {
            return res.status(404).json({ message: "Commission not found." });
        }

        // Check if commission has a guide track
        if (!commission.guideTrackForSingerUrl) {
            return res.status(404).json({ message: "This commission does not have a guide track for singers." });
        }

        // Find the user
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Check access - user must be either the customer or artist for this commission
        const isCustomer = commission.customer.toString() === user._id.toString();
        const isArtist = commission.artist.toString() === user._id.toString();

        if (!isCustomer && !isArtist) {
            return res.status(403).json({ 
                message: "You do not have access to this commission's guide track." 
            });
        }

        // If it's a YouTube URL, redirect to it
        if (commission.guideTrackForSingerUrl.includes('youtube')) {
            return res.redirect(commission.guideTrackForSingerUrl);
        }

        // Extract S3 key from guide track URL
        const url = new URL(commission.guideTrackForSingerUrl);
        const keyMatch = url.pathname.match(/^\/?(.+)/);
        const s3Key = keyMatch ? keyMatch[1] : null;

        if (!s3Key) {
            return res.status(500).json({ message: "Invalid guide track URL." });
        }

        // Configure S3 client
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

        // Get the file from S3
        const { GetObjectCommand } = await import('@aws-sdk/client-s3');
        const getParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
        };

        const command = new GetObjectCommand(getParams);
        const data = await s3Client.send(command);

        // Set appropriate headers
        res.setHeader('Content-Type', data.ContentType || 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="commission-guide-track-${commission.name || commission._id}.mp3"`);

        // Stream the file to the response
        data.Body.pipe(res);

        console.log('Commission guide track downloaded:', {
            commissionId: commission._id,
            userId: req.userId,
            s3Key: s3Key
        });

    } catch (error) {
        console.error('Error downloading commission guide track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Delete a commission guide track
 * @param {Express.Request & {userId: string, params: {id: string}}} req - Express request with auth and commission ID
 * @param {Express.Response} res - Express response
 * @returns {Promise<void>} Promise resolving to success message
 */
export const deleteCommissionGuideTrack = async (req, res) => {
    try {
        const commissionId = req.params.id;

        // Validate commission ID
        if (!commissionId || commissionId === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(commissionId)) {
            return res.status(400).json({ message: "A valid Commission ID is required." });
        }

        // Find the commission
        const commission = await CommissionRequest.findById(commissionId);
        if (!commission) {
            return res.status(404).json({ message: "Commission not found." });
        }

        // Find the user
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check authorization - only the artist can delete guide tracks
        if (commission.artist.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                message: "You are not authorized to delete guide tracks for this commission. Only the assigned artist can delete guide tracks." 
            });
        }

        // Check if commission has a guide track
        if (!commission.guideTrackForSingerUrl) {
            return res.status(404).json({ message: "This commission does not have a guide track to delete." });
        }

        // If it's a file (not YouTube), delete from S3
        if (!commission.guideTrackForSingerUrl.includes('youtube')) {
            try {
                const url = new URL(commission.guideTrackForSingerUrl);
                const keyMatch = url.pathname.match(/^\/?(.+)/);
                const s3Key = keyMatch ? keyMatch[1] : null;
                
                if (s3Key) {
                    const s3Client = new S3Client({
                        region: process.env.AWS_REGION,
                        credentials: {
                            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                        },
                    });

                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: s3Key,
                    }));
                    
                    console.log('Deleted commission guide track from S3:', s3Key);
                }
            } catch (err) {
                console.error('Error deleting commission guide track from S3:', err);
                // Continue to clear the URL from the database even if S3 deletion fails
            }
        }

        // Remove guide track URL from the commission
        commission.guideTrackForSingerUrl = '';
        await commission.save();

        console.log('Commission guide track deleted successfully:', {
            commissionId: commission._id,
            userId: req.userId
        });

        return res.status(200).json({ 
            message: 'Guide track deleted successfully!'
        });

    } catch (error) {
        console.error('Error deleting commission guide track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
