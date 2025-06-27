import fs from 'fs';
import path from 'path';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { sanitizeFileName } from '../utils/regexSanitizer.js';
import User from '../models/User.js';

/**
 * Upload a license document to S3 and return the file URL
 * Expects multipart/form-data with 'licenseDocument' file field
 * Requires authentication (req.userId)
 */
export const uploadLicenseDocument = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (!req.file) {
            return res.status(400).json({ message: 'No license document uploaded' });
        }
        const licenseFile = req.file;
        const licenseFileName = sanitizeFileName(licenseFile.originalname);
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const licenseUploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `licenses/${Date.now()}-${licenseFileName}`,
            Body: licenseFile.buffer,
            ContentType: licenseFile.mimetype,
            ACL: 'private',
            Metadata: {
                'original-mime-type': licenseFile.mimetype || '',
                'original-extension': path.extname(licenseFile.originalname) || ''
            }
        };
        const licenseData = await new Upload({ client: s3Client, params: licenseUploadParams }).done();
        return res.status(200).json({
            message: 'License document uploaded successfully',
            licenseDocumentUrl: licenseData.Location,
            s3Key: licenseUploadParams.Key
        });
    } catch (error) {
        console.error('Error uploading license document:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Delete a license document from S3 and remove its reference from the track
 * Expects: req.body.trackId (or req.query.trackId), and user must be owner or admin
 */
export const deleteLicenseDocument = async (req, res) => {
    try {
        const trackId = req.body.trackId || req.query.trackId;
        if (!trackId) {
            return res.status(400).json({ message: 'trackId is required.' });
        }
        const BackingTrack = (await import('../models/backing_track.js')).default;
        const track = await BackingTrack.findById(trackId);
        if (!track) {
            return res.status(404).json({ message: 'Track not found.' });
        }
        // Only allow the uploader (track.user) or an admin to delete license
        if (track.user.toString() !== req.userId && (!req.user || req.user.role !== 'admin')) {
            return res.status(403).json({ message: 'You are not authorized to delete this license document.' });
        }
        if (!track.licenseDocumentUrl) {
            return res.status(400).json({ message: 'No license document to delete.' });
        }
        // Extract S3 key from URL
        const url = new URL(track.licenseDocumentUrl);
        const s3Key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
        await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
        }));
        track.licenseDocumentUrl = undefined;
        await track.save();
        return res.status(200).json({ message: 'License document deleted successfully.' });
    } catch (error) {
        console.error('Error deleting license document:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
