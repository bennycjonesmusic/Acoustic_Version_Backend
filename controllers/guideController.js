import fs from 'fs';
import path from 'path';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import BackingTrack from '../models/backing_track.js';
import User from '../models/User.js';
import { sanitizeFileName } from '../utils/regexSanitizer.js';
import * as Filter from 'bad-words';

/**
 * @typedef {Object} GuideTrackUploadResponse
 * @property {string} message - Response message
 * @property {string} guideTrackUrl - URL of the uploaded guide track
 * @property {string} [error] - Error message if upload failed
 */

/**
 * Upload a guide track file for an existing backing track
 * @param {Express.Request & {userId: string, params: {id: string}, file: Express.Multer.File}} req - Express request with auth, track ID, and file
 * @param {Express.Response} res - Express response
 * @returns {Promise<GuideTrackUploadResponse>} Promise resolving to API response with guide track URL
 */
export const uploadGuideTrack = async (req, res) => {
    try {
        const trackId = req.params.id;
        const profanity = new Filter.Filter();

        // Validate track ID
        if (!trackId || trackId === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(trackId)) {
            return res.status(400).json({ message: "A valid Track ID is required." });
        }

        // Check if file was uploaded
        if (!req.file) {
            return res.status(400).json({ message: 'No guide track file uploaded' });
        }        // Validate file type (MP3 files only)
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

        // Find the track
        const track = await BackingTrack.findById(trackId);
        if (!track) {
            return res.status(404).json({ message: "Track not found." });
        }

        // Find the user
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check ownership - only track owner can upload guide tracks
        if (track.user.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                message: "You are not authorized to upload guide tracks for this track. Only the track owner can upload guide tracks." 
            });
        }

        // Sanitize file name
        const sanitizedFileName = sanitizeFileName(req.file.originalname);
        
        // Create temporary file
        const tmp = await import('os');
        const tmpDir = tmp.tmpdir();
        const tempFilePath = path.join(tmpDir, `guidetrack_${Date.now()}_${sanitizedFileName}`);
        fs.writeFileSync(tempFilePath, req.file.buffer);

        // Configure S3 client
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

        // If track already has a guide track, delete the old one from S3
        if (track.guideTrackUrl) {
            try {
                const url = new URL(track.guideTrackUrl);
                const keyMatch = url.pathname.match(/^\/?(.+)/);
                const oldKey = keyMatch ? keyMatch[1] : null;
                
                if (oldKey) {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: oldKey,
                    }));
                    console.log('Deleted old guide track from S3:', oldKey);
                }
            } catch (err) {
                console.error('Error deleting old guide track from S3:', err);
                // Don't fail the upload if old file deletion fails
            }
        }

        // Upload to S3 with private access (not public-read like previews)
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `guide-tracks/${Date.now()}-${sanitizedFileName}`,
            Body: fs.createReadStream(tempFilePath),
            StorageClass: 'STANDARD',
            ContentType: req.file.mimetype,
            ACL: 'private' // Private - only accessible to buyers
        };

        const data = await new Upload({ client: s3Client, params: uploadParams }).done();
        
        // Clean up temp file
        fs.unlinkSync(tempFilePath);

        // Update the track with the new guide track URL
        track.guideTrackUrl = data.Location;
        await track.save();

        console.log('Guide track uploaded successfully:', {
            trackId: track._id,
            guideTrackUrl: data.Location,
            userId: req.userId
        });

        return res.status(200).json({ 
            message: 'Guide track uploaded successfully!',
            guideTrackUrl: data.Location
        });

    } catch (error) {
        console.error('Error uploading guide track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Download a guide track (only for purchasers and track owners)
 * @param {Express.Request & {userId: string, params: {id: string}}} req - Express request with auth and track ID
 * @param {Express.Response} res - Express response
 * @returns {Promise<void>} Promise resolving to file stream
 */
export const downloadGuideTrack = async (req, res) => {
    try {
        const trackId = req.params.id;

        // Validate track ID
        if (!trackId || trackId === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(trackId)) {
            return res.status(400).json({ message: "A valid Track ID is required." });
        }

        // Find the track
        const track = await BackingTrack.findById(trackId);
        if (!track) {
            return res.status(404).json({ message: "Track not found." });
        }

        // Check if track has a guide track
        if (!track.guideTrackUrl) {
            return res.status(404).json({ message: "This track does not have a guide track." });
        }

        // Find the user
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: "User not found." });
        }

        // Check access - user must have purchased the track or be the track owner
        const hasPurchased = user.purchasedTracks.some(pt => 
            (pt.track?.toString?.() || pt.track) === track._id.toString()
        );
        const isOwner = user.uploadedTracks.some(id => id.equals(track._id));

        if (!hasPurchased && !isOwner) {
            return res.status(403).json({ 
                message: "You must purchase this track to access the guide track." 
            });
        }

        // Extract S3 key from guide track URL
        const url = new URL(track.guideTrackUrl);
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
        res.setHeader('Content-Disposition', `attachment; filename="guide-track-${track.title}.mp3"`);

        // Stream the file to the response
        data.Body.pipe(res);

        console.log('Guide track downloaded:', {
            trackId: track._id,
            userId: req.userId,
            s3Key: s3Key
        });

    } catch (error) {
        console.error('Error downloading guide track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Delete a guide track from an existing backing track
 * @param {Express.Request & {userId: string, params: {id: string}}} req - Express request with auth and track ID
 * @param {Express.Response} res - Express response
 * @returns {Promise<void>} Promise resolving to success message
 */
export const deleteGuideTrack = async (req, res) => {
    try {
        const trackId = req.params.id;

        // Validate track ID
        if (!trackId || trackId === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(trackId)) {
            return res.status(400).json({ message: "A valid Track ID is required." });
        }

        // Find the track
        const track = await BackingTrack.findById(trackId);
        if (!track) {
            return res.status(404).json({ message: "Track not found." });
        }

        // Find the user
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Check ownership - only track owner can delete guide tracks
        if (track.user.toString() !== user._id.toString()) {
            return res.status(403).json({ 
                message: "You are not authorized to delete guide tracks for this track. Only the track owner can delete guide tracks." 
            });
        }

        // Check if track has a guide track
        if (!track.guideTrackUrl) {
            return res.status(404).json({ message: "This track does not have a guide track to delete." });
        }

        // Delete from S3
        try {
            const url = new URL(track.guideTrackUrl);
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
                
                console.log('Deleted guide track from S3:', s3Key);
            }
        } catch (err) {
            console.error('Error deleting guide track from S3:', err);
            // Continue to clear the URL from the database even if S3 deletion fails
        }

        // Remove guide track URL from the track
        track.guideTrackUrl = '';
        await track.save();

        console.log('Guide track deleted successfully:', {
            trackId: track._id,
            userId: req.userId
        });

        return res.status(200).json({ 
            message: 'Guide track deleted successfully!'
        });

    } catch (error) {
        console.error('Error deleting guide track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
