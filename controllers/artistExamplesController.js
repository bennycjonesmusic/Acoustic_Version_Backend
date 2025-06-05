import User from '../models/User.js';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getAudioPreview } from '../utils/audioPreview.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
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
        // Save file to temp
        const ext = path.extname(req.file.originalname);
        const tmp = await import('os');
        const tmpDir = tmp.tmpdir();        const tmpInputPath = path.join(tmpDir, `${user._id}_example_input${Date.now()}${ext}`);
        // Always use .mp3 for preview output to avoid ffmpeg ambiguity
        const tmpPreviewPath = path.join(tmpDir, `${user._id}_example_preview${Date.now()}.mp3`);
        
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
        }
        
        // Create 30s preview using the working getAudioPreview utility
        await getAudioPreview(tmpInputPath, tmpPreviewPath, 30);
        
        // Check if output file was created and get its size
        if (fs.existsSync(tmpPreviewPath)) {
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
            }
        } else {
            console.error('❌ Preview file was not created!');
            throw new Error('Preview generation failed - no output file created');
        }
        
        // Upload preview to S3
        const key = `examples/${user._id}_${Date.now()}.mp3`;
        
        await new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: key,
                Body: fs.createReadStream(tmpPreviewPath),
                StorageClass: 'STANDARD',
                ContentType: 'audio/mpeg', // Ensure correct content type for MP3 previews
                ACL: 'public-read' // Ensure the file is public
            },
        }).done();
        fs.unlinkSync(tmpInputPath);
        fs.unlinkSync(tmpPreviewPath);
        const url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        user.artistExamples.push({ url });
        await user.save();
        // Map _id to id for response
        const mappedExamples = user.artistExamples.map(e => ({
            ...e.toObject(),
            id: e._id.toString(),
            _id: undefined
        }));
        return res.status(200).json({ success: true, artistExamples: mappedExamples });
    } catch (err) {
        return res.status(500).json({ error: 'Upload failed', details: err.message });
    }
};

// GET /artist/examples
export const getArtistExamples = async (req, res) => {
    try {
        const user = await User.findById(req.params.id || req.userId);
        if (!user || (user.role !== 'artist' && user.role !== 'admin')) {
            return res.status(404).json({ error: 'Artist not found' });
        }
        return res.status(200).json({ artistExamples: user.artistExamples.map(e => ({
            ...e.toObject(),
            id: e._id.toString(), //convert to clean objects and map _id to id for ease
            _id: undefined
        })) });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch examples' });
    }
};


export const deleteArtistExample = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || (user.role !== 'artist' && user.role !== 'admin')) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const { exampleId } = req.params;
        // Find the example to delete
        const example = user.artistExamples.find(e => e._id.toString() === exampleId);
        if (!example) {
            return res.status(404).json({ error: 'Example not found' });
        }
        // Extract S3 key from URL
        let key;
        try {
            const url = new URL(example.url);
            key = url.pathname.replace(/^\//, '');
        } catch (e) {
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
            } catch (s3err) {
                // Log but do not block deletion if S3 fails
                console.error('Failed to delete S3 object:', s3err.message);
            }
        }
        // Remove from user's artistExamples
        user.artistExamples = user.artistExamples.filter(e => e._id.toString() !== exampleId);
        await user.save();
        // Map _id to id for response
        const mappedExamples = user.artistExamples.map(e => ({
            ...e.toObject(),
            id: e._id.toString(),
            _id: undefined
        }));
        return res.status(200).json({ success: true, artistExamples: mappedExamples });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete example' });
    }
};
