// uploadMiddleware.js
import multer from 'multer';
import { S3Client } from '@aws-sdk/client-s3';  // AWS SDK v3 for S3
import { Upload } from '@aws-sdk/lib-storage'; // For multipart uploads
import fs from 'fs';  // Used to read files locally (for temporary storage)
import dotenv from 'dotenv';
import crypto from 'crypto';
import * as Filter from 'bad-words'; //package to prevent profanity
import { sanitizeFileName } from '../utils/regexSanitizer.js';

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

// Profanity filter instance
const profanityFilter = new Filter.Filter();

const MAX_USER_STORAGE = 1024 * 1024 * 1024; // 1GB per user

const fileFilter = async (req, file, cb) => {
    // Sanitize file name
    const sanitized = sanitizeFileName(file.originalname);
    if (sanitized !== file.originalname) {
        console.warn('[multer fileFilter] File name sanitized:', file.originalname, '->', sanitized);
        file.originalname = sanitized;
    }
    // Profanity check for file name
    if (profanityFilter.isProfane(file.originalname)) {
        console.error('[multer fileFilter] Rejected: profane file name', file.originalname);
        return cb(new Error('File name contains inappropriate language.'), false);
    }
    // Check user storage quota (async)
    try {
        if (req.userId) {
            const BackingTrack = (await import('../models/backing_track.js')).default;
            const userTracks = await BackingTrack.find({ user: req.userId }, 'fileUrl');
            // Use S3 to get file sizes if not stored in DB, or store size in DB for each track
            // For now, estimate by summing req.file.size + all user's uploaded files (if available)
            // If you store file size in DB, use that field instead of fetching from S3
            let totalSize = 0;
            for (const track of userTracks) {
                // If you store file size in DB, use track.fileSize
                if (track.fileSize) {
                    totalSize += track.fileSize;
                }
            }
            // Add current file size
            totalSize += file.size;
            if (totalSize > MAX_USER_STORAGE) {
                console.error('[multer fileFilter] Rejected: user storage quota exceeded', totalSize);
                return cb(new Error('You have exceeded your total upload storage limit (1GB). Please delete old tracks before uploading more.'), false);
            }
        }
    } catch (err) {
        console.error('[multer fileFilter] Error checking user storage quota:', err);
        return cb(new Error('Error checking user storage quota.'), false);
    }

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