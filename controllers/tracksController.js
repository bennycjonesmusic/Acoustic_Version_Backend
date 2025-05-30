import fs from 'fs'; // for reading & deleting temp files
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage'; // for streaming uploads to S3
import BackingTrack from '../models/backing_track.js';
import User from '../models/User.js'; // 
import { parseKeySignature } from '../utils/parseKeySignature.js';
import { uploadTrackSchema, reviewSchema, commentSchema } from './validationSchemas.js';
import * as Filter from 'bad-words';
import { sendFollowersNewTrack } from '../utils/updateFollowers.js';
import path from 'path';



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
    if (!user.purchasedTracks.some(pt => (pt.track?.toString?.() || pt.track) === track._id.toString())) {
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
    // Update artist's averageTrackRating
    const artist = await User.findById(track.user);
    if (artist && (artist.role === 'artist' || artist.role === 'admin')) {
      await artist.calculateAverageTrackRating();
    }
    return res.status(200).json({message: "Rating submitted successfully", track});
}catch(error) {
    console.error('Error reviewing track:', error);
    return res.status(500).json({message: 'Internal server error'})
}



}

export const uploadTrack = async (req, res) => {
    const { error } = uploadTrackSchema.validate(req.body);
    const Artist = await User.findById(req.userId);
    // Only allow upload if user is artist or admin
    if (Artist.role !== 'artist' && Artist.role !== 'admin') {
      return res.status(403).json({ message: "Only artists or admins can upload tracks." })
    }
    if (Artist.profileStatus !== 'approved') {


        return res.status(403).json({ message: "Your profile has not been approved yet. Please await admin approval."});
    }
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        // Write buffer to temp file
        const tmp = await import('os');
        const tmpDir = tmp.tmpdir();
        const tempFilePath = path.join(tmpDir, `uploadtrack_${Date.now()}_${req.file.originalname}`);
        fs.writeFileSync(tempFilePath, req.file.buffer);
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
            Body: fs.createReadStream(tempFilePath),
            ACL: 'private',
            StorageClass: 'STANDARD',
            ContentType: req.file.mimetype, // Ensure correct audio content type
        };
        const data = await new Upload({ client: s3Client, params: uploadParams }).done();
        fs.unlinkSync(tempFilePath);

        // --- 30-second preview logic ---
        let previewUrl = null;
        const previewPath = tempFilePath + '-preview.mp3'; // Define previewPath
        const { getAudioPreview } = await import('../utils/audioPreview.js');
        try {
            // Write buffer to temp file for ffmpeg
            fs.writeFileSync(tempFilePath + '-full', req.file.buffer);
            await getAudioPreview(tempFilePath + '-full', previewPath, 30);
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
            fs.unlinkSync(tempFilePath + '-full');
        } catch (err) {
            console.error('Error generating/uploading preview:', err);
            // Clean up temp files if they exist
            try { fs.existsSync(previewPath) && fs.unlinkSync(previewPath); } catch {}
            try { fs.existsSync(tempFilePath + '-full') && fs.unlinkSync(tempFilePath + '-full'); } catch {}
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
            guideTrackUrl: req.body.guideTrackUrl || '',
            licenseStatus: req.body.licenseStatus,
            licensedFrom: req.body.licensedFrom

        });
        await newTrack.save();
        const updateUser = await User.findByIdAndUpdate(req.userId, { $push: { uploadedTracks: newTrack._id } }, { new: true });
        if (!updateUser) {
            return res.status(404).json({ message: "User not found." });
        }
        // Notify followers by email
        if (updateUser.followers && updateUser.followers.length > 0) {
            // Get followers' emails
            const followers = await User.find({ _id: { $in: updateUser.followers } }, 'email');
            for (const follower of followers) {
                if (follower.email) {
                    // Send email asynchronously, don't block response
                    sendFollowersNewTrack(follower.email, updateUser, newTrack).catch(e => console.error('Email error:', e));
                }
            }
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
        // Only allow the uploader (track.user) or an admin to delete the track
        const requestingUser = await User.findById(req.userId);
        const isUploader = Track.user.toString() === req.userId;
        const isAdmin = requestingUser && requestingUser.role === 'admin';
        if (!isUploader && !isAdmin) {
            return res.status(403).json({ message: "You are not authorized to delete this track." });
        }

        if (!isAdmin){ //make it so admin can delete tracks regardless of purchases. DANGEROUS, make sure to only use sparingly.
        const purchasers = await User.find({ 
            'purchasedTracks.track': Track._id
        });
        if (purchasers.length > 0){

            Track.isDeleted = true; //mark track as deleted, then we will use CRON job to monitor when the track is no longer part of anyones purchases
            await Track.save();
            return res.status(200).json({ message: "Track marked as deleted. It will be permanently removed once no longer purchased"});
        }
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
        // Remove track from all users' purchasedTracks arrays
        await User.updateMany(
          { 'purchasedTracks.track': Track._id },
          { $pull: { purchasedTracks: { track: Track._id } } }
        );
        // Remove track from all users' uploadedTracks arrays (should only be uploader, but for safety)
        await User.updateMany(
          { uploadedTracks: Track._id },
          { $pull: { uploadedTracks: Track._id } }
        );
        await s3Client.send(new DeleteObjectCommand(deleteParameters));
        // Delete preview from S3 if it exists
        if (Track.previewUrl) {
            try {
                // Extract the S3 key from the previewUrl
                const url = new URL(Track.previewUrl);
                // S3 key is everything after the bucket name
                // e.g. https://bucket.s3.amazonaws.com/previews/1234-sample.mp3
                // key = previews/1234-sample.mp3
                const keyMatch = url.pathname.match(/^\/?(.+)/);
                const previewKey = keyMatch ? keyMatch[1] : null;
                if (previewKey) {
                    await s3Client.send(new DeleteObjectCommand({
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: previewKey,
                    }));
                }
            } catch (err) {
                console.error('Error deleting preview from S3:', err);
            }
        }
        await BackingTrack.findByIdAndDelete(req.params.id);
        // Recalculate averageTrackRating for the user after hard delete
        if (Track.user) {
            const artist = await User.findById(Track.user);
            if (artist && (artist.role === 'artist' || artist.role === 'admin')) {
                await artist.calculateAverageTrackRating();
            }
        }
        return res.status(200).json({ message: 'Track and file deleted' });
    } catch (error) {
        console.error('There was an error deleting track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

//this function gets all the tracks uploaded by the logged in user

export const getUploadedTracks = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const tracks = await BackingTrack.find({ user: req.userId }).sort({ createdAt: -1 });
        return res.status(200).json({ tracks: Array.isArray(tracks) ? tracks : [] });
    } catch (error) {
        console.error('Error fetching tracks:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getPurchasedTracks = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }
        const user = await User.findById(req.userId).populate('purchasedTracks.track');
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }
        const purchasedTracks = Array.isArray(user.purchasedTracks) ? user.purchasedTracks : [];
        return res.status(200).json({ tracks: purchasedTracks });
    } catch (error) {
        console.error('Error fetching purchased tracks:', error);
        return res.status(500).json({ message: "Failed to fetch purchased tracks", error: error.message });
    }
};

export const downloadTrack = async (req, res) => {
  try {
    const track = await BackingTrack.findById(req.params.id);
    if (!track) {
      return res.status(404).json({ message: "Track not found." });
    }
    const userId = req.userId;
    const user = await User.findById(userId); //find the user wanting to download track
    const hasBought = user.purchasedTracks.some(pt => (pt.track?.toString?.() || pt.track) === track._id.toString());
    const hasUploaded = user.uploadedTracks.some(id => id.equals(track._id));
    if (!hasBought && !hasUploaded) {
      return res.status(403).json({ message: "You are not allowed to download this track. Please purchase" });
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
};

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
    if (!user.purchasedTracks.some(pt => (pt.track?.toString?.() || pt.track) === track._id.toString())) {
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
    return res.status(500).json({ message: 'Failed to add comment', error: error.message });
  }
};

export const deleteComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Find the track containing the comment
    const track = await BackingTrack.findOne({ 'comments._id': commentId });
    if (!track) {
      return res.status(404).json({ message: 'Comment or track not found' });
    }
    // Find the comment
    const comment = track.comments.id(commentId);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    // Only the user who made the comment can delete it
    if (comment.user.toString() !== req.userId) {
      return res.status(403).json({ message: 'You are not authorized to delete this comment.' });
    }
    // Remove the comment using splice instead of .remove()
    const commentIndex = track.comments.findIndex(c => c._id.toString() === commentId);
    if (commentIndex === -1) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    track.comments.splice(commentIndex, 1);
    await track.save();
    return res.status(200).json({ message: 'Comment deleted successfully', comments: track.comments });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return res.status(500).json({ message: 'Failed to delete comment', error: error.message });
  }
};

// Get all tracks uploaded by a specific user (by userId param)
export const getUploadedTracksByUserId = async (req, res) => {
    try {
        const userId = req.params.id;
        console.log('[DEBUG] getUploadedTracksByUserId userId param:', userId);
        const tracks = await BackingTrack.find({ user: userId }).sort({ createdAt: -1 });
        console.log('[DEBUG] getUploadedTracksByUserId found tracks:', tracks.map(t => ({id: t._id, user: t.user, title: t.title})));
        // Remove Array.isArray check, always return the tracks array
        return res.status(200).json({ tracks });
    } catch (error) {
        console.error('Error fetching tracks by user ID:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
