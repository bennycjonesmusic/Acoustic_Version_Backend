import User from '../models/User.js';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getAudioPreview } from '../utils/audioPreview.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import cache from '../utils/cache.js';
dotenv.config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// POST /artist/examples/upload
export const uploadArtistExample = async (req, res) => {
    let tmpInputPath = null;
    let tmpPreviewPath = null;
    
    try {
        const user = await User.findById(req.userId);
        if (!user || (user.role !== 'artist' && user.role !== 'admin')) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        if (user.artistExamples.length >= 3) {
            return res.status(400).json({ error: 'Maximum of 3 examples allowed.' });
        }
        
        // Validate file buffer
        if (!req.file.buffer || req.file.buffer.length === 0) {
            return res.status(400).json({ error: 'Uploaded file is empty or corrupted' });
        }
        
        // Save file to temp
        const ext = path.extname(req.file.originalname);
        const tmp = await import('os');
        const tmpDir = tmp.tmpdir();
        tmpInputPath = path.join(tmpDir, `${user._id}_example_input${Date.now()}${ext}`);
        // Always use .mp3 for preview output to avoid ffmpeg ambiguity
        tmpPreviewPath = path.join(tmpDir, `${user._id}_example_preview${Date.now()}.mp3`);
        
        fs.writeFileSync(tmpInputPath, req.file.buffer);
        console.log(`Creating preview for artist example: ${tmpInputPath} -> ${tmpPreviewPath}`);
        console.log(`Input file size: ${fs.statSync(tmpInputPath).size} bytes`);
        console.log(`Input file exists: ${fs.existsSync(tmpInputPath)}`);
        console.log(`Original filename: ${req.file.originalname}`);
        console.log(`File mimetype: ${req.file.mimetype}`);
        
        // Verify the input file is valid by checking if it's a real audio file
        try {
            // Try to read some header bytes to verify it's not corrupted
            const headerBytes = fs.readFileSync(tmpInputPath, { start: 0, end: 10 });
            console.log(`Input file header: ${headerBytes.toString('hex')}`);
        } catch (headerErr) {
            console.error('Error reading input file header:', headerErr);
            throw new Error('Input file appears to be corrupted');
        }
        
        // Create 30s preview using the working getAudioPreview utility
        await getAudioPreview(tmpInputPath, tmpPreviewPath, 30);
        
        // Check if output file was created and get its size
        if (!fs.existsSync(tmpPreviewPath)) {
            console.error('❌ Preview file was not created!');
            throw new Error('Preview generation failed - no output file created');
        }
        
        const outputSize = fs.statSync(tmpPreviewPath).size;
        console.log(`Preview created. Output file size: ${outputSize} bytes`);
        
        if (outputSize < 1000) {
            console.error(`⚠️ WARNING: Output file is suspiciously small (${outputSize} bytes) - likely corrupted`);
            // Read the first few bytes to see what's in the file
            try {
                const outputHeader = fs.readFileSync(tmpPreviewPath, { start: 0, end: 50 });
                console.log(`Output file header: ${outputHeader.toString('hex')}`);
            } catch (outputHeaderErr) {
                console.error('Error reading output file header:', outputHeaderErr);
            }
            throw new Error(`Preview generation produced invalid output (${outputSize} bytes)`);
        }
        
        // Upload preview to S3
        const key = `examples/${user._id}_${Date.now()}.mp3`;
        
        // Create a buffer from the file instead of a stream to avoid potential corruption
        const previewBuffer = fs.readFileSync(tmpPreviewPath);
        
        const uploadResult = await new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: key,
                Body: previewBuffer, // Use buffer instead of stream
                StorageClass: 'STANDARD',
                ContentType: 'audio/mpeg', // Ensure correct content type for MP3 previews
                ACL: 'public-read', // Ensure the file is public
                CacheControl: 'public, max-age=3600, must-revalidate', // Cache for 1 hour with revalidation
                Metadata: {
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD',
                    'Access-Control-Allow-Headers': 'Range, Content-Range'
                }
            },
        }).done();
        
        // Clean up temp files immediately after successful upload
        if (tmpInputPath && fs.existsSync(tmpInputPath)) {
            fs.unlinkSync(tmpInputPath);
            tmpInputPath = null;
        }
        if (tmpPreviewPath && fs.existsSync(tmpPreviewPath)) {
            fs.unlinkSync(tmpPreviewPath);
            tmpPreviewPath = null;
        }
        
        const url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        user.artistExamples.push({ url });
        await user.save();
        
        // Invalidate featured artists cache since artist examples are part of the featured data
        cache.del('featuredArtists');
        console.log('Invalidated featuredArtists cache after artist example upload');
        
        // Map _id to id for response
        const mappedExamples = user.artistExamples.map(e => ({
            ...e.toObject(),
            id: e._id.toString(),
            _id: undefined
        }));
        
        return res.status(200).json({ success: true, artistExamples: mappedExamples });
        
    } catch (err) {
        console.error('Artist example upload error:', err);
        
        // Clean up temp files in case of error
        try {
            if (tmpInputPath && fs.existsSync(tmpInputPath)) {
                fs.unlinkSync(tmpInputPath);
            }
            if (tmpPreviewPath && fs.existsSync(tmpPreviewPath)) {
                fs.unlinkSync(tmpPreviewPath);
            }
        } catch (cleanupErr) {
            console.error('Error cleaning up temp files:', cleanupErr);
        }
        
        // Ensure we always return a proper JSON response, never binary data
        const errorMessage = err.message || 'Upload failed';
        return res.status(500).json({ 
            error: 'Upload failed', 
            details: errorMessage,
            timestamp: new Date().toISOString()
        });
    }
};

// GET /artist/examples
export const getArtistExamples = async (req, res) => {
    try {
        const userId = req.params.id || req.userId;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }
        
        const user = await User.findById(userId);
        if (!user || (user.role !== 'artist' && user.role !== 'admin')) {
            return res.status(404).json({ error: 'Artist not found' });
        }
        
        // Map _id to id for response consistency
        const mappedExamples = user.artistExamples.map(e => ({
            ...e.toObject(),
            id: e._id.toString(),
            _id: undefined
        }));
        
        return res.status(200).json({ 
            artistExamples: mappedExamples,
            count: mappedExamples.length
        });
        
    } catch (err) {
        console.error('Get artist examples error:', err);
        
        // Ensure we always return a proper JSON response
        const errorMessage = err.message || 'Failed to fetch examples';
        return res.status(500).json({ 
            error: 'Failed to fetch examples', 
            details: errorMessage,
            timestamp: new Date().toISOString()
        });
    }
};


export const deleteArtistExample = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || (user.role !== 'artist' && user.role !== 'admin')) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        
        const { exampleId } = req.params;
        if (!exampleId) {
            return res.status(400).json({ error: 'Example ID is required' });
        }
        
        // Find the example to delete
        const example = user.artistExamples.find(e => e._id.toString() === exampleId);
        if (!example) {
            return res.status(404).json({ error: 'Example not found' });
        }
        
        // Extract S3 key from URL
        let key = null;
        try {
            const url = new URL(example.url);
            key = url.pathname.replace(/^\//, '');
        } catch (urlErr) {
            console.error('Error parsing S3 URL:', urlErr);
            key = null;
        }
        
        // Delete from S3 if key is valid
        if (key) {
            try {
                const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
                await s3Client.send(new DeleteObjectCommand({
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: key,
                }));
                console.log(`Successfully deleted S3 object: ${key}`);
            } catch (s3err) {
                // Log but do not block deletion if S3 fails
                console.error('Failed to delete S3 object:', s3err.message);
            }
        } else {
            console.warn('Could not extract S3 key from URL, skipping S3 deletion');
        }
        
        // Remove from user's artistExamples
        user.artistExamples = user.artistExamples.filter(e => e._id.toString() !== exampleId);
        await user.save();
        
        // Invalidate featured artists cache since artist examples are part of the featured data
        cache.del('featuredArtists');
        console.log('Invalidated featuredArtists cache after artist example deletion');
        
        // Map _id to id for response
        const mappedExamples = user.artistExamples.map(e => ({
            ...e.toObject(),
            id: e._id.toString(),
            _id: undefined
        }));
        
        return res.status(200).json({ 
            success: true, 
            artistExamples: mappedExamples,
            message: 'Example deleted successfully'
        });
        
    } catch (err) {
        console.error('Artist example deletion error:', err);
        
        // Ensure we always return a proper JSON response
        const errorMessage = err.message || 'Failed to delete example';
        return res.status(500).json({ 
            error: 'Failed to delete example', 
            details: errorMessage,
            timestamp: new Date().toISOString()
        });
    }
};
