import User from '../models/User.js';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getAudioPreview } from '../utils/audioPreview.js';
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
        if (!user || user.role !== 'artist') {
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
        const tmpPreviewPath = path.join(tmpDir, `${user._id}_example_preview${Date.now()}${ext}`);
        fs.writeFileSync(tmpInputPath, req.file.buffer);
        // Always generate a 30s preview (even if file is longer)
        await getAudioPreview(tmpInputPath, tmpPreviewPath, 30);
        // Upload preview to S3
        const key = `examples/${user._id}_${Date.now()}${ext}`;
        await new Upload({
            client: s3Client,
            params: {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: key,
                Body: fs.createReadStream(tmpPreviewPath),
                ACL: 'public-read',
                ContentType: req.file.mimetype,
            },
        }).done();
        fs.unlinkSync(tmpInputPath);
        fs.unlinkSync(tmpPreviewPath);
        const url = `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        user.artistExamples.push({ url });
        await user.save();
        return res.status(200).json({ success: true, artistExamples: user.artistExamples });
    } catch (err) {
        return res.status(500).json({ error: 'Upload failed', details: err.message });
    }
};

// GET /artist/examples
export const getArtistExamples = async (req, res) => {
    try {
        const user = await User.findById(req.params.id || req.userId);
        if (!user || user.role !== 'artist') {
            return res.status(404).json({ error: 'Artist not found' });
        }
        return res.status(200).json({ artistExamples: user.artistExamples });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch examples' });
    }
};

// DELETE /artist/examples/:exampleId
export const deleteArtistExample = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || user.role !== 'artist') {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const { exampleId } = req.params;
        user.artistExamples = user.artistExamples.filter(e => e._id.toString() !== exampleId);
        await user.save();
        return res.status(200).json({ success: true, artistExamples: user.artistExamples });
    } catch (err) {
        return res.status(500).json({ error: 'Failed to delete example' });
    }
};
