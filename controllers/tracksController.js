import fs from 'fs'; // for reading & deleting temp files
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage'; // for streaming uploads to S3
import BackingTrack from '../models/backing_track.js';
import User from '../models/User.js'; // 
import { parseKeySignature } from '../utils/parseKeySignature.js';
import { uploadTrackSchema, reviewSchema, commentSchema } from './validationSchemas.js';
import * as Filter from 'bad-words';




export const rateTrack = async(req, res) => {
try{
    //function for rating tracks
    const { rating } = req.body;
    const user = await User.findById(req.userId);
    if (!user) {
        return res.status(404).json({message: "User not found"});
    }
    //find user from token

    //find the track from the id in the url
    const track = await BackingTrack.findById(req.params.id);
    if (!track) {
        return res.status(404).json({message: "Track not found"});
    }
    //check if user has NOT bought the track
    if (!user.boughtTracks.some(id => id.equals(track._id))) {
        return res.status(400).json({ message: "You can only rate tracks you have purchased." });
    }
    //validate rating input
    const { error } = reviewSchema.validate({ rating });
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }
    // Only allow one rating per user per track (update if exists)
    const existingRating = track.ratings.find(r => r.user.equals(user._id));
    if (existingRating) {
        existingRating.stars = rating;
        existingRating.ratedAt = new Date();
    } else {
        track.ratings.push({
            user: user._id,
            stars: rating,
            ratedAt: new Date()
        });
    }
    track.calculateAverageRating();
    await track.save();
    return res.status(200).json({message: "Rating submitted successfully", track});
}catch(error) {
    console.error('Error reviewing track:', error);
    return res.status(500).json({message: 'Internal server error'})
}



}

export const uploadTrack = async (req, res) => {
    const { error } = uploadTrackSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const fileStream = Buffer.from(req.file.buffer);
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `songs/${Date.now()}-${req.file.originalname}`,
            Body: fileStream,
            ACL: 'private',
            StorageClass: 'STANDARD',
        };
        const data = await new Upload({ client: s3Client, params: uploadParams }).done();

        // --- 30-second preview logic ---
        let previewUrl = null;
        const tmp = await import('os');
        const path = await import('path');
        const { getAudioPreview } = await import('../utils/audioPreview.js');
        const tmpDir = tmp.tmpdir();
        const previewFilename = `preview-${Date.now()}-${req.file.originalname}`;
        const previewPath = path.join(tmpDir, previewFilename);
        try {
            // Write buffer to temp file for ffmpeg
            fs.writeFileSync(previewPath + '-full', fileStream);
            await getAudioPreview(previewPath + '-full', previewPath, 30);
            // Upload preview to S3
            const previewUploadParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `previews/${Date.now()}-${req.file.originalname}`,
                Body: fs.createReadStream(previewPath),
                ACL: 'private',
                StorageClass: 'STANDARD',
            };
            const previewData = await new Upload({ client: s3Client, params: previewUploadParams }).done();
            console.log('S3 preview upload result:', previewData);
            previewUrl = previewData.Location;
            console.log('Assigned previewUrl:', previewUrl);
            // Clean up temp files
            fs.unlinkSync(previewPath);
            fs.unlinkSync(previewPath + '-full');
        } catch (err) {
            console.error('Error generating/uploading preview:', err);
            // Clean up temp files if they exist
            try { fs.existsSync(previewPath) && fs.unlinkSync(previewPath); } catch {}
            try { fs.existsSync(previewPath + '-full') && fs.unlinkSync(previewPath + '-full'); } catch {}
            // Add error message for debugging
            previewUrl = null;
            res.locals.previewError = err && err.message ? err.message : 'Unknown error generating preview';
        }
        // --- end preview logic ---

        const newTrack = new BackingTrack({
            title: req.body.title || req.file.originalname,
            description: req.body.description || 'No description provided',
            fileUrl: data.Location,
            s3Key: uploadParams.Key,
            price: parseFloat(req.body.price) || 0,
            user: req.userId,
            previewUrl: previewUrl || undefined,
            originalArtist: req.body.originalArtist,
            backingTrackType: req.body.backingTrackType,
            genre: req.body.genre,
            vocalRange: req.body.vocalRange,
            instructions: req.body.instructions || '',
            youtubeGuideUrl: req.body.youtubeGuideUrl || '',
            guideTrackUrl: req.body.guideTrackUrl || ''
        });
        await newTrack.save();
        const updateUser = await User.findByIdAndUpdate(req.userId, { $push: { uploadedTracks: newTrack._id } }, { new: true });
        if (!updateUser) {
            return res.status(404).json({ message: "User not found." });
        }
        // If preview failed, include error in response for debugging
        if (!previewUrl && res.locals.previewError) {
            return res.status(200).json({ message: 'File uploaded, but preview failed', previewError: res.locals.previewError, track: newTrack });
        }
        return res.status(200).json({ message: 'File uploaded successfully!', track: newTrack });
    } catch (error) {
        console.error('Error uploading backing track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};



export const listS3 = async (req, res) => {
    const s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });
    const bucketName = process.env.AWS_BUCKET_NAME;
    try {
        const command = new ListObjectsV2Command({
            Bucket: bucketName
        });
        const data = await s3.send(command);
        const tracks = (data.Contents || []).map(item => ({
            key: item.Key,
            lastModified: item.LastModified,
            size: item.Size
        }));
        res.json(tracks);
    } catch (error) {
        console.error('Error listing backing tracks:', error);
        return res.status(500).json({ error: 'Failed to list backing tracks' });
    }
};

//delete a track by id
export const deleteTrack = async (req, res) => {
    try {
        const Track = await BackingTrack.findById(req.params.id);
        if (!Track) {
            return res.status(404).json({ message: "Track not found." });
        }
        if (Track.user.toString() !== req.userId) {
            return res.status(403).json({ message: "You are not authorized to delete this track." });
        }
        if (!Track.s3Key) {
            return res.status(400).json({ message: "Track does not have an associated s3Key." });
        }
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const deleteParameters = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: Track.s3Key,
        };
        await User.findByIdAndUpdate(req.userId, { $pull: { uploadedTracks: req.params.id } }, { new: true });
        await s3Client.send(new DeleteObjectCommand(deleteParameters));
        await BackingTrack.findByIdAndDelete(req.params.id);
        return res.status(200).json({ message: 'Track and file deleted' });
    } catch (error) {
        console.error('There was an error deleting track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getUploadedTracks = async (req, res) => {
    try {
        // Defensive: ensure req.userId is present
        if (!req.userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const tracks = await BackingTrack.find({ user: req.userId }).sort({ createdAt: -1 });
        // Defensive: always return an array
        return res.status(200).json(Array.isArray(tracks) ? tracks : []);
    } catch (error) {
        console.error('Error fetching tracks:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getBoughtTracks = async (req, res) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    // Find the user by their ID and populate the 'boughtTracks' array
    const user = await User.findById(req.userId).populate('boughtTracks');
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    // Defensive: ensure boughtTracks is always an array
    const boughtTracks = Array.isArray(user.boughtTracks) ? user.boughtTracks : [];
    if (boughtTracks.length === 0) {
      return res.status(404).json({ message: "No bought tracks found" });
    }
    return res.status(200).json(boughtTracks);
  } catch (error) {
    console.error('Error fetching bought tracks:', error);
    return res.status(500).json({ message: "Failed to fetch bought tracks", error: error.message });
  }
};

export const downloadTrack = async (req, res) => {

try {

    const track = await BackingTrack.findById(req.params.id);
    if (!track) {
        return res.status(404).json({message: "Track not found."});
    }

    // If the track is private, check for access token
    if (track.isPrivate) {
        const token = req.query.token || req.headers['x-access-token'];
        if (!token || token !== track.privateAccessToken) {
            return res.status(403).json({ message: "You are not allowed to download this private track. Valid access token required." });
        }
    } else {
        // If not private, require purchase or ownership as before
        const userId = req.userId;
        const user = await User.findById(userId);
        const hasBought = user.boughtTracks.some(id => id.equals(track._id));
        const hasUploaded = user.uploadedTracks.some(id => id.equals(track._id));
        if (!hasBought && !hasUploaded) {
            return res.status(403).json({message: "You are not allowed to download this track. Please purchase"})
        }
    }

     const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

          const createParameters = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: track.s3Key,
        };

        const command = new GetObjectCommand(createParameters);
        const data = await s3Client.send(command);
        track.downloadCount += 1;
        await track.save();

        res.setHeader('Content-Type', data.ContentType);
res.setHeader('Content-Disposition', `attachment; filename="${track.title}"`);

data.Body.pipe(res);
return;
    
} catch (error) {

    console.error('Error downloading track:', error);
    return res.status(500).json({ message: 'Internal server error' });



}





}


export const commentTrack = async (req, res) => {
  try {
    const { comment } = req.body;
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const track = await BackingTrack.findById(req.params.id);
    if (!track) {
      return res.status(404).json({ message: 'Track not found' });
    }
    // Only allow users who have bought the track to comment
    if (!user.boughtTracks.some(id => id.equals(track._id))) {
      return res.status(400).json({ message: 'You can only comment on tracks you have purchased.' });
    }
    // Validate comment input
    const { error } = commentSchema.validate({ comment });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }
    // Profanity filter
    const profanity = new Filter.Filter();
    if (profanity.isProfane(comment)) {
      return res.status(400).json({ message: 'Please avoid using inappropriate language.' });
    }
    // Add comment to track
    track.comments.push({
      user: user._id,
      text: comment,
      createdAt: new Date()
    });
    await track.save();
    return res.status(200).json({ message: 'Comment added successfully', comments: track.comments });
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};
