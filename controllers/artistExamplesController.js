import User from '../models/User.js';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getAudioPreview } from '../utils/audioPreview.js';
dotenv.config();

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

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
        const tmpDir = tmp.tmpdir();
        const tmpInputPath = path.join(tmpDir, `${user._id}_example_input${Date.now()}${ext}`);
        // Always use .mp3 for preview output to avoid ffmpeg ambiguity
        const tmpPreviewPath = path.join(tmpDir, `${user._id}_example_preview${Date.now()}.mp3`);
        fs.writeFileSync(tmpInputPath, req.file.buffer);
        // Always generate a 30s preview (even if file is longer)
        await getAudioPreview(tmpInputPath, tmpPreviewPath, 30);
        // Upload preview to S3
        const key = `examples/${user._id}_${Date.now()}.mp3`;
        await new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: key,
                Body: fs.createReadStream(tmpPreviewPath),
                StorageClass: 'STANDARD',
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
