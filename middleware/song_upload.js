// uploadMiddleware.js
import multer from 'multer';
import { S3Client } from '@aws-sdk/client-s3';  // AWS SDK v3 for S3
import { Upload } from '@aws-sdk/lib-storage'; // For multipart uploads
import fs from 'fs';  // Used to read files locally (for temporary storage)
import dotenv from 'dotenv';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

// Set up S3 client with AWS SDK v3
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const storage = multer.memoryStorage();
// Setup multer for temporary file storage

const allowedMimeTypes = [
    'audio/mpeg',    // .mp3
    'audio/wav',     // .wav
    'audio/x-wav',   // .wav (alternative)
    'audio/wave',    // .wav (alternative)
    'audio/vnd.wave',// .wav (alternative)
    'audio/flac',    // .flac
    'audio/ogg',     // .ogg
    'audio/mp4',     // .m4a
    'audio/aac',     // .aac
    'audio/x-aac',   // .aac (alternative)
    'audio/x-m4a',   // .m4a (alternative)
    'audio/x-ms-wma',// .wma
    'audio/x-ms-wax',// .wax
    'audio/basic',   // .au, .snd
    'audio/x-aiff',  // .aiff, .aif, .aifc
    'audio/aiff',    // .aiff
    'audio/x-pn-realaudio', // .ra, .ram
    'audio/mid',     // .mid, .midi
    'audio/x-midi',  // .mid, .midi
];

const fileFilter = (req, file, cb) => {
    console.log('[multer fileFilter] Received file:', {
        fieldname: file.fieldname,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size
    });
    if (!allowedMimeTypes.includes(file.mimetype)) {
        console.error('[multer fileFilter] Rejected: invalid mimetype', file.mimetype);
        return cb(new Error('Only audio files are allowed!'), false);
    };

    if (file.size > 50 * 1024 * 1024){
        console.error('[multer fileFilter] Rejected: file too large', file.size);
        return cb(new Error('File larger than 50mb'), false);
    }

    cb(null, true);
}
const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB limit
}); // Store files temporarily on disk

// Export the upload middleware as default
export default upload;