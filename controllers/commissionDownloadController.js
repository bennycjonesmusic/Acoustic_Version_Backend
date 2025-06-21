import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import CommissionRequest from '../models/CommissionRequest.js';
import User from '../models/User.js';
import mime from 'mime-types';

// Only the customer (or admin) can download commission files
export const downloadCommissionFile = async (req, res) => {
    const { commissionId, type } = req.query; // type: 'finished' or 'preview'
    const userId = req.userId;
    try {
        const commission = await CommissionRequest.findById(commissionId).populate('customer');
        console.log('[downloadCommissionFile] Loaded commission:', commission);
        if (!commission) {
            return res.status(404).json({ message: 'Commission not found.' });
        }
        // Only the customer or admin can access
        if (
            commission.customer._id.toString() !== userId &&
            !(req.user && req.user.role === 'admin')
        ) {
            return res.status(403).json({ message: 'You are not allowed to access this file.' });
        }
        let fileUrl;
        if (type === 'finished') fileUrl = commission.finishedTrackUrl;
        else if (type === 'preview') fileUrl = commission.previewTrackUrl;
        else return res.status(400).json({ message: 'Invalid file type.' });
        console.log(`[downloadCommissionFile] fileUrl for type=${type}:`, fileUrl);
        if (!fileUrl) return res.status(404).json({ message: 'File not found.' });
        // Extract S3 key from URL
        const urlParts = fileUrl.split('.amazonaws.com/');
        if (urlParts.length !== 2) return res.status(400).json({ message: 'Invalid file URL.' });
        const s3Key = urlParts[1];
        console.log('[downloadCommissionFile] S3 key:', s3Key);
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const command = new GetObjectCommand({
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
        });
        const data = await s3Client.send(command);

        // --- Robust extension and MIME handling ---
        let downloadFilename = `${commissionId}_${type}`;
        let originalExtension = '';
        let originalMimeType = '';
        if (data.Metadata) {
            if (typeof data.Metadata['original-extension'] === 'string') {
                const ext = data.Metadata['original-extension'].trim();
                if (/^\.[a-z0-9]{2,5}$/i.test(ext) && [
                    '.wav', '.mp3', '.flac', '.aac', '.ogg', '.m4a', '.aiff', '.wma'
                ].includes(ext.toLowerCase())) {
                    originalExtension = ext;
                }
            }
            if (typeof data.Metadata['original-mime-type'] === 'string') {
                originalMimeType = data.Metadata['original-mime-type'].trim();
            }
        }
        // If filename doesn't already have an extension, add the original extension if valid
        if (originalExtension && !/\.[a-zA-Z0-9]{2,5}$/.test(downloadFilename)) {
            downloadFilename += originalExtension;
        }
        // Fallback: If no extension at all, guess from file size or use .mp3/.wav
        if (!/\.[a-zA-Z0-9]{2,5}$/.test(downloadFilename)) {
            const fileSize = (data.ContentLength || data.Body?.length || 0);
            if (fileSize > 10 * 1024 * 1024) {
                downloadFilename += '.wav';
            } else {
                downloadFilename += '.mp3';
            }
        }
        // If S3 ContentType is generic, use fallback logic
        let contentType = data.ContentType;
        if (!contentType || ["application/octet-stream", "file"].includes(contentType.toLowerCase())) {
            contentType = originalMimeType || mime.getType(downloadFilename) || 'application/octet-stream';
        }
        const encodedName = encodeURIComponent(downloadFilename);
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`);
        data.Body.pipe(res);
    } catch (error) {
        console.error('Error downloading commission file:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
