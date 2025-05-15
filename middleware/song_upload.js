// uploadMiddleware.js
import multer from 'multer';
import { S3Client } from '@aws-sdk/client-s3';  // AWS SDK v3 for S3
import { Upload } from '@aws-sdk/lib-storage'; // For multipart uploads
import fs from 'fs';  // Used to read files locally (for temporary storage)
import dotenv from 'dotenv';

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

// Setup multer for temporary file storage
const upload = multer({ dest: 'uploads/' }); // Store files temporarily on disk

// Export the upload middleware as default
export default upload;