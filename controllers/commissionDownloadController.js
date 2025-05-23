import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import CommissionRequest from '../models/CommissionRequest.js';
import User from '../models/User.js';

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
        res.setHeader('Content-Type', data.ContentType || 'audio/mpeg');
        res.setHeader('Content-Disposition', `attachment; filename="${commissionId}_${type}${s3Key.substring(s3Key.lastIndexOf('.'))}"`);
        data.Body.pipe(res);
    } catch (error) {
        console.error('Error downloading commission file:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
