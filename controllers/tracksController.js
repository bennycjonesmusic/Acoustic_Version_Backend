import fs from 'fs'; // for reading & deleting temp files
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage'; // for streaming uploads to S3
import BackingTrack from '../models/backing_track.js';
import CommissionRequest from '../models/CommissionRequest.js';
import User from '../models/User.js'; // 
import { parseKeySignature } from '../utils/parseKeySignature.js';
import { uploadTrackSchema, editTrackSchema, reviewSchema, commentSchema } from './validationSchemas.js';
import { validateUserForPayouts } from '../utils/stripeAccountStatus.js';
import * as Filter from 'bad-words';
import { notifyFollowersOfNewTrack, createFirstUploadCongratulationsNotification, createRatingNotification } from '../utils/notificationHelpers.js';
import { getAudioPreview } from '../utils/audioPreview.js';
import path from 'path';
import { sanitizeFileName } from '../utils/regexSanitizer.js';


/**
 * @typedef {Object} BackingTrack
 * @property {string} _id - Track ID
 * @property {string} title - Track title
 * @property {string} description - Track description
 * @property {number} price - Track price
 * @property {string} fileUrl - S3 file URL
 * @property {string} [previewUrl] - S3 preview URL
 * @property {string} user - User ID who uploaded
 * @property {string} originalArtist - Original artist name
 * @property {'karaoke'|'instrumental'|'both'} backingTrackType - Type of track
 * @property {string} genre - Music genre
 * @property {string} [vocalRange] - Vocal range description
 * @property {string} [instructions] - Instructions for use
 * @property {string} [youtubeGuideUrl] - YouTube guide URL
 * @property {string} [guideTrackUrl] - Guide track URL
 * @property {'licensed'|'original'|'public_domain'} [licenseStatus] - License status
 * @property {string} [licensedFrom] - License source
 * @property {number} averageRating - Average rating
 * @property {number} downloadCount - Download count
 * @property {Date} createdAt - Creation date
 * @property {Date} updatedAt - Last update date
 */

/**
 * @typedef {Object} APIResponse
 * @property {string} message - Response message
 * @property {BackingTrack} [track] - Single track data
 * @property {BackingTrack[]} [tracks] - Array of tracks
 * @property {string} [error] - Error message
 */

/**
 * @typedef {Object} TrackEditRequest
 * @property {string} [title] - Track title
 * @property {string} [description] - Track description
 * @property {number} [price] - Track price
 * @property {string} [originalArtist] - Original artist
 * @property {'karaoke'|'instrumental'|'both'} [backingTrackType] - Track type
 * @property {string} [genre] - Music genre
 * @property {string} [vocalRange] - Vocal range
 * @property {string} [instructions] - Usage instructions
 * @property {string} [youtubeGuideUrl] - YouTube guide URL
 * @property {string} [guideTrackUrl] - Guide track URL
 * @property {'licensed'|'original'|'public_domain'} [licenseStatus] - License status
 * @property {string} [licensedFrom] - License source
 */

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
    }    // Only allow one rating per user per track (update if exists)
    const userId = user._id || user.id;
    const existingRating = track.ratings.find(r => r.user.equals(userId));
    if (existingRating) {
        existingRating.stars = rating;
        existingRating.ratedAt = new Date();
    } else {
        track.ratings.push({
            user: userId,
            stars: rating,
            ratedAt: new Date()
        });
    }    track.calculateAverageRating();
    await track.save();
    
    // Create rating notification for the artist (only for new ratings, not updates)
    if (!existingRating) {
        try {
            await createRatingNotification(
                track.user, // artistId
                user.username, // raterUsername
                track._id, // trackId
                track.title, // trackTitle
                rating // rating
            );
            console.log(`[TRACKS] Created rating notification for artist ${track.user} for track "${track.title}"`);
        } catch (notificationError) {
            console.error('[TRACKS] Error creating rating notification:', notificationError);
        }
    }
    
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
//need to make it so user has valid stripe act before able to sell or upload tracks
export const uploadTrack = async (req, res) => {
    console.log('=== UPLOAD TRACK FUNCTION CALLED ===');
    console.log('Original filename:', req.file?.originalname);
    const { error } = uploadTrackSchema.validate(req.body);
    const Artist = await User.findById(req.userId);
    const profanity = new Filter.Filter();

    // Check for duplicate title by same user
    const existingTrack = await BackingTrack.findOne({ title: req.body.title, user: req.userId });
    if (existingTrack) {
        return res.status(400).json({ message: "You already have a track with this title. Please choose a different title." });
    }


      // Only allow upload if user is artist or admin
    if (Artist.role !== 'artist' && Artist.role !== 'admin') {
      return res.status(403).json({ message: "Only artists or admins can upload tracks." })
    }
      if (Artist.profileStatus !== 'approved' && process.env.NODE_ENV !== 'test') {
        return res.status(403).json({ message: "Your profile has not been approved yet. Please upload some examples of your playing and await admin approval." });
    }

    // Comprehensive payout validation
    const payoutValidation = validateUserForPayouts(Artist);
    if (!payoutValidation.valid) {
        return res.status(403).json({ 
            message: `Cannot upload tracks: ${payoutValidation.reason}. Please complete your Stripe account setup to enable payouts.` 
        });
    }
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
            if (profanity.isProfane(req.file.originalname)){
        return res.status(400).json({ message: "Please avoid using inappropriate language in the track file name."});
    }

        const sanitizedFileName = sanitizeFileName(req.file.originalname);
        const fieldsToCheck = ["title", "description", "originalArtist", "instructions"];
        for (const field of fieldsToCheck) {
            if (req.body[field] && profanity.isProfane(req.body[field])) {
                return res.status(400).json({ message: `Please avoid using inappropriate language in the ${field} field.` });
            }
        }        // Write buffer to temp file
        const tmp = await import('os');
        const tmpDir = tmp.tmpdir();
        const tempFilePath = path.join(tmpDir, `uploadtrack_${Date.now()}_${sanitizedFileName}`);
        const trimmedFilePath = path.join(tmpDir, `trimmed_${Date.now()}_${sanitizedFileName}`);        fs.writeFileSync(tempFilePath, req.file.buffer);
        
        // Use original file directly instead of problematic silence trimming
        console.log('Using original file without silence trimming...');
        fs.copyFileSync(tempFilePath, trimmedFilePath);
        console.log('File prepared for upload');
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `songs/${Date.now()}-${sanitizedFileName}`,
            Body: fs.createReadStream(trimmedFilePath), // Use trimmed file instead of original
            StorageClass: 'STANDARD',
            ContentType: req.file.mimetype, // Use original file's MIME type (e.g., audio/wav, audio/mpeg, etc.)
            ACL: 'private' // Ensure full song is private
        };
        const data = await new Upload({ client: s3Client, params: uploadParams }).done();
        fs.unlinkSync(tempFilePath);
        fs.unlinkSync(trimmedFilePath);        // --- 30-second preview logic ---
        let previewUrl = null;
        const previewPath = tempFilePath + '-preview.mp3'; // Define previewPath
        try {
            // Write buffer to temp file for ffmpeg
            fs.writeFileSync(tempFilePath + '-full', req.file.buffer);
            // Use the working getAudioPreview utility instead of problematic trimming
            await getAudioPreview(tempFilePath + '-full', previewPath, 30);
            // Remove file extension from sanitized filename, but be careful about file extensions that might be part of the title
            let cleanFileName = sanitizedFileName.replace(/\.[^/.]+$/, ''); // Remove actual file extension first
            // Only remove common audio format suffixes if they appear to be file extensions (after underscore or at end)
            cleanFileName = cleanFileName.replace(/_(?:wav|mp3|flac|aac|ogg|m4a)$/i, '');
            console.log('DEBUG: sanitizedFileName:', sanitizedFileName);
            console.log('DEBUG: cleanFileName:', cleanFileName);            const previewUploadParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `previews/${Date.now()}-${cleanFileName}.mp3`, // Ensure .mp3 extension and clean filename
                Body: fs.createReadStream(previewPath),
                StorageClass: 'STANDARD',
                ContentType: 'audio/mpeg', // Force audio/mpeg content type for previews
                ACL: 'public-read', // Ensure preview is public
                CacheControl: 'public, max-age=3600, must-revalidate', // Cache for 1 hour with revalidation
                Metadata: {
                    'Content-Type': 'audio/mpeg',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD',
                    'Access-Control-Allow-Headers': 'Range, Content-Range'
                }
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
            res.locals.previewError = err && err.message ? err.message : 'Unknown error generating preview';        }
        // --- end preview logic ---
        
        // Parse key signature if provided
        let keyData = {};
        if (req.body.keySignature && req.body.keySignature.trim()) {
            try {
                const { key, isFlat, isSharp } = parseKeySignature(req.body.keySignature);
                keyData = {
                    key,
                    isFlat,
                    isSharp,
                    // Determine major/minor from key signature pattern (basic logic)
                    isMajor: !req.body.keySignature.toLowerCase().includes('m'),
                    isMinor: req.body.keySignature.toLowerCase().includes('m')
                };
            } catch (error) {
                return res.status(400).json({ 
                    message: `Invalid key signature: ${error.message}` 
                });
            }
        }
        
        const newTrack = new BackingTrack({
            title: req.body.title || req.file.originalname,
            description: req.body.description || 'No description provided',
            fileUrl: data.Location,
            s3Key: uploadParams.Key,
            price: parseFloat(req.body.price) || 0,
            user: req.userId,
            previewUrl: previewUrl || undefined,
            originalArtist: req.body.originalArtist,
            type: req.body.type,
            backingTrackType: req.body.backingTrackType,
            genre: req.body.genre,            vocalRange: req.body.vocalRange,
            instructions: req.body.instructions || '',
            youtubeGuideUrl: req.body.youtubeGuideUrl || '',
            guideTrackUrl: req.body.guideTrackUrl || '', // Note: Guide tracks should be uploaded separately via /guide/:id/upload endpoint
            licenseStatus: req.body.licenseStatus,
            licensedFrom: req.body.licensedFrom,
            fileSize: req.file.size, // Store file size for storage tracking
            ...keyData // Spread the parsed key signature data
        });
        await newTrack.save();
        // Update user's storageUsed        // Check if this is the artist's first upload (before adding the new track)
        const isFirstUpload = Artist.uploadedTracks.length === 0;
        
        Artist.numOfUploadedTracks = Artist.uploadedTracks.length + 1;
        await Artist.save(); //not Sure why I wrote the code below seeing as it is basically redundant with Artist. could just use Artist instead        await User.findByIdAndUpdate(req.userId, { $inc: { storageUsed: req.file.size }, $push: { uploadedTracks: newTrack._id || newTrack.id } });
        
        // Send congratulations notification for first upload
        if (isFirstUpload) {
            try {
                // Defensive coding: handle both _id and id fields
                const artistId = Artist._id || Artist.id;
                if (artistId) {
                    await createFirstUploadCongratulationsNotification(artistId);
                    console.log(`First upload congratulations notification sent to artist: ${Artist.username}`);
                } else {
                    console.error('Could not create first upload notification: missing artist ID');
                }
            } catch (notifError) {
                console.error('Error creating first upload congratulations notification:', notifError);
                // Don't fail the upload if notification fails
            }
        }
        
        // Notify followers via in-app notifications
        if (Artist.followers && Artist.followers.length > 0) {
            // Send notifications asynchronously, don't block response
            // Defensive coding: handle both _id and id fields
            const trackId = newTrack._id || newTrack.id;
            notifyFollowersOfNewTrack(req.userId, trackId, newTrack.title).catch(e => {
                console.error('Notification error:', e);
            });
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
    // Validate track ID
    if (!req.params.id || req.params.id === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(req.params.id)) {
        return res.status(400).json({ message: "A valid Track ID is required." });
    }
    try {
        const Track = await BackingTrack.findById(req.params.id);
        if (!Track) {
            return res.status(404).json({ message: "Track not found." });
        }
        // Only allow the uploader (track.user) or an admin to delete the track
        const requestingUser = await User.findById(req.userId);
        const isUploader = Track.user.toString() === req.userId;        const isAdmin = requestingUser && requestingUser.role === 'admin';
        if (!isUploader && !isAdmin) {
            return res.status(403).json({ message: "You are not authorized to delete this track." });
        }

        // Check if track has any purchasers (do this once)
        const trackId = Track._id || Track.id;
        const purchasers = await User.find({ 
            'purchasedTracks.track': trackId
        });

        if (purchasers.length > 0) {
            // Track has purchasers - always soft delete to preserve user access
            Track.isDeleted = true;
            await Track.save();
            const adminMessage = isAdmin ? " by admin" : "";
            return res.status(200).json({ 
                message: `Track marked as deleted${adminMessage}. It will be permanently removed once no longer purchased`
            });
        }

        // Track has no purchasers - safe to hard delete
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
        };        await User.findByIdAndUpdate(req.userId, { $pull: { uploadedTracks: req.params.id } }, { new: true });
        
        // NOTE: We don't remove from purchasedTracks here because hard delete only happens 
        // when there are no purchasers (verified by safety check above)
        
        // Remove track from all users' uploadedTracks arrays (should only be uploader, but for safety)
        await User.updateMany(
          { uploadedTracks: trackId },
          { $pull: { uploadedTracks: trackId } }
        );

        const user = await User.findById(req.userId);
        if (user) {
             user.numOfUploadedTracks = user.uploadedTracks.length;
            await user.save();
            }
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
                }            } catch (err) {
                console.error('Error deleting preview from S3:', err);
            }
        }
        await BackingTrack.findByIdAndDelete(trackId);
        // Decrement user's storageUsed by the deleted track's fileSize
        if (Track.user && Track.fileSize) {
            await User.findByIdAndUpdate(Track.user, { $inc: { storageUsed: -Math.abs(Track.fileSize) } });
        }
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

        // Get the user to determine their actual role
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Parse pagination parameters
        const { page = 1, limit = 10, orderBy = 'date-uploaded' } = req.query;
        let pageNum = parseInt(page, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        let limitNum = parseInt(limit, 10);
        if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
        if (limitNum > 50) limitNum = 50; // Cap at 50 tracks per page

        const skip = (pageNum - 1) * limitNum;        // Set up sorting
        let sort = {};
        if (orderBy === "popularity") sort = { purchaseCount: -1 };
        if (orderBy === "date-uploaded") sort = { createdAt: -1 };
        if (orderBy === "date-uploaded/ascending") sort = { createdAt: 1 };
        if (orderBy === "rating") sort = { averageRating: -1 };
        if (orderBy === "price") sort = { price: 1 };
        if (orderBy === "alphabetical") sort = { title: 1 };

        // Get total count for pagination metadata
        const totalTracks = await BackingTrack.countDocuments({ user: req.userId });        // Get paginated tracks with only essential fields for display
        const tracks = await BackingTrack.find({ user: req.userId })
            .select('title price customerPrice averageRating numOfRatings previewUrl guideTrackUrl createdAt purchaseCount downloadCount originalArtist backingTrackType genre isPrivate user')
            .sort(sort)
            .skip(skip)
            .limit(limitNum);
            
        console.log(`Found ${tracks.length} tracks for user ${req.userId} with role ${user.role}`);
        tracks.forEach(track => {
            console.log(`Track: ${track.title}, Raw guideTrackUrl: ${track.guideTrackUrl}`);
        });// Calculate pagination metadata
        const totalPages = Math.ceil(totalTracks / limitNum);        // Convert tracks to JSON with proper context so guideTrackUrl is included
        const tracksWithContext = tracks.map(track => 
            track.toJSON({ 
                viewerId: req.userId,
                viewerRole: user.role
            })
        );return res.status(200).json({ 
            tracks: Array.isArray(tracksWithContext) ? tracksWithContext : [],
            pagination: {
                currentPage: pageNum,
                totalPages: totalPages,
                totalTracks: totalTracks,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
                limit: limitNum
            }
        });
    } catch (error) {
        console.error('Error fetching tracks:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getPurchasedTracks = async (req, res) => {
    try {
        if (!req.userId) {
            return res.status(401).json({ message: 'User not authenticated' });
        }        // Parse pagination parameters
        const { page = 1, limit = 10, orderBy = 'purchase-date' } = req.query;
        let pageNum = parseInt(page, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        let limitNum = parseInt(limit, 10);
        if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
        if (limitNum > 50) limitNum = 50; // Cap at 50 tracks per page

        const skip = (pageNum - 1) * limitNum;        // Get the user to determine their actual role
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Only populate essential fields for purchased tracks display
        const userWithTracks = await User.findById(req.userId).populate({
            path: 'purchasedTracks.track',
            select: 'title originalArtist price customerPrice averageRating numOfRatings previewUrl guideTrackUrl createdAt user',
            populate: {
                path: 'user',
                select: 'username avatar'
            }
        });        if (!userWithTracks) {
            return res.status(401).json({ message: "User not found" });
        }

        const purchasedTracks = Array.isArray(userWithTracks.purchasedTracks) ? userWithTracks.purchasedTracks : [];

         if (purchasedTracks.length === 0) {
            return res.status(200).json({ 
                tracks: [],
                pagination: {
                    currentPage: 1,
                    totalPages: 0,
                    totalTracks: 0,
                    hasNextPage: false,
                    hasPrevPage: false,
                    limit: limitNum
                }
            });
        } //handle case when tracks are empty. makes it so error is not returned on front end
        
        
        // Apply sorting based on orderBy parameter (since populate sorting might not work as expected)
        if (orderBy === 'purchase-date') {
            purchasedTracks.sort((a, b) => new Date(b.purchasedAt) - new Date(a.purchasedAt));
        } else if (orderBy === 'purchase-date/ascending') {
            purchasedTracks.sort((a, b) => new Date(a.purchasedAt) - new Date(b.purchasedAt));
        } else if (orderBy === 'alphabetical' && purchasedTracks.length > 0) {
            purchasedTracks.sort((a, b) => {
                if (!a.track || !b.track) return 0;
                return a.track.title.localeCompare(b.track.title);
            });        } else if (orderBy === 'price' && purchasedTracks.length > 0) {
            purchasedTracks.sort((a, b) => {
                if (!a.track || !b.track) return 0;
                return (a.track.price || 0) - (b.track.price || 0);
            });
        } else if (orderBy === 'rating' && purchasedTracks.length > 0) {
            purchasedTracks.sort((a, b) => {
                if (!a.track || !b.track) return 0;
                return (b.track.averageRating || 0) - (a.track.averageRating || 0);
            });        }

        // Apply pagination
        const totalTracks = purchasedTracks.length;
        const paginatedTracks = purchasedTracks.slice(skip, skip + limitNum);        // Apply role-based transform to each track to include guideTrackUrl for customers
        const purchasedTrackIds = paginatedTracks.map(pt => pt.track?.id || pt.track?._id).filter(Boolean);
        
        const tracksWithContext = paginatedTracks.map(purchasedTrack => {
            if (purchasedTrack.track) {
                const trackWithContext = purchasedTrack.track.toJSON({
                    viewerRole: user.role,
                    viewerId: req.userId,
                    purchasedTrackIds: purchasedTrackIds
                });
                return {
                    ...purchasedTrack.toJSON(),
                    track: trackWithContext
                };
            }
            return purchasedTrack;
        });

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalTracks / limitNum);

        return res.status(200).json({ 
            tracks: tracksWithContext,
            pagination: {
                currentPage: pageNum,
                totalPages: totalPages,
                totalTracks: totalTracks,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
                limit: limitNum
            }
        });
    } catch (error) {
        console.error('Error fetching purchased tracks:', error);
        return res.status(500).json({ message: "Failed to fetch purchased tracks", error: error.message });
    }
};

export const downloadTrack = async (req, res) => {
  try {
    const trackId = req.params.id;
    console.log('[downloadTrack] Requested by user:', req.userId, 'for track:', trackId);
    // Validate track ID
    if (!trackId || trackId === 'undefined' || !/^[a-fA-F0-9]{24}$/.test(trackId)) {
      console.warn('[downloadTrack] Invalid track ID:', trackId);
      return res.status(400).json({ message: "A valid Track ID is required." });
    }
    let track = await BackingTrack.findById(trackId);
    let isCommission = false;
    if (!track) {
      track = await CommissionRequest.findById(trackId);
      isCommission = !!track;
    }
    if (!track) {
      console.warn('[downloadTrack] Track not found:', trackId);
      return res.status(404).json({ message: "Track not found." });
    }
    const userId = req.userId;
    const user = await User.findById(userId); //find the user wanting to download track
    if (!user) {
      console.warn('[downloadTrack] User not found:', userId);
      return res.status(404).json({ message: "User not found." });
    }
    const hasBought = user.purchasedTracks.some(pt => (pt.track?.toString?.() || pt.track) === track._id.toString());
    const hasUploaded = user.uploadedTracks.some(id => id.equals(track._id));
    console.log('[downloadTrack] hasBought:', hasBought, 'hasUploaded:', hasUploaded);
    if (!hasBought && !hasUploaded) {
      console.warn('[downloadTrack] Forbidden: user', userId, 'has not bought or uploaded track', track._id.toString());
      return res.status(403).json({ message: "You are not allowed to download this track. Please purchase" });
    }
    // Update user's download tracking for purchased tracks
    if (hasBought) {
      const purchaseRecord = user.purchasedTracks.find(pt => (pt.track?.toString?.() || pt.track) === track._id.toString());
      if (purchaseRecord) {
        purchaseRecord.downloadCount = (purchaseRecord.downloadCount || 0) + 1;
        purchaseRecord.lastDownloadedAt = new Date();
        await user.save();
      }
    }
    const s3Client = new S3Client({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
    let s3Key, downloadFilename;
    if (isCommission) {
      // Extract S3 key and filename from finishedTrackUrl
      if (!track.finishedTrackUrl) {
        return res.status(404).json({ message: 'No finished track available for this commission.' });
      }
      try {
        const url = new URL(track.finishedTrackUrl);
        s3Key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
        // Use the last part of the path as the filename
        downloadFilename = s3Key.split('/').pop();
        // If the filename is generic (e.g., commission-track.mp3), use name, originalFilename, or title
        if (downloadFilename && /^commission-track\.[a-z0-9]+$/i.test(downloadFilename)) {
          let extension = downloadFilename.split('.').pop();
          let baseName = (track.name && track.name.replace(/\.[^/.]+$/, ''))
            || (track.originalFilename && track.originalFilename.replace(/\.[^/.]+$/, ''))
            || track.title
            || 'commission-track';
          // Sanitize baseName
          baseName = baseName.replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '_');
          downloadFilename = `${baseName}.${extension}`;
        }
      } catch (e) {
        return res.status(500).json({ message: 'Invalid finishedTrackUrl for commission.' });
      }
    } else {
      s3Key = track.s3Key;
      // Use the last part of the s3Key as the filename, fallback to track.title
      downloadFilename = (s3Key && s3Key.split('/').pop()) || track.title || trackId;
    }
    if (!s3Key) {
      return res.status(500).json({ message: 'No S3 key found for this track.' });
    }
    const createParameters = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
    };
    const command = new GetObjectCommand(createParameters);
    const data = await s3Client.send(command);
    track.downloadCount = (track.downloadCount || 0) + 1;
    await track.save();
    res.setHeader('Content-Type', data.ContentType);
    // Use the extracted filename (with extension)
    res.setHeader('Content-Disposition', `attachment; filename="${downloadFilename}"`);
    data.Body.pipe(res);
    return;
  } catch (error) {
    console.error('[downloadTrack] Error downloading track:', error, 'user:', req.userId, 'track:', req.params.id);
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
    }    // Add comment to track
    track.comments.push({
      user: user._id || user.id,
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

        // Parse pagination parameters
        const { page = 1, limit = 10, orderBy = 'date-uploaded' } = req.query;
        let pageNum = parseInt(page, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        let limitNum = parseInt(limit, 10);
        if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
        if (limitNum > 50) limitNum = 50; // Cap at 50 tracks per page

        const skip = (pageNum - 1) * limitNum;

        // Set up sorting
        let sort = {};
        if (orderBy === "popularity") sort = { purchaseCount: -1 };
        if (orderBy === "date-uploaded") sort = { createdAt: -1 };
        if (orderBy === "date-uploaded/ascending") sort = { createdAt: 1 };
        if (orderBy === "rating") sort = { averageRating: -1 };
        if (orderBy === "price") sort = { price: 1 };
        if (orderBy === "alphabetical") sort = { title: 1 };

        // Get total count for pagination metadata
        const totalTracks = await BackingTrack.countDocuments({ user: userId });          // Get paginated tracks with user populated and essential fields only
        const tracks = await BackingTrack.find({ user: userId })
            .select('title price customerPrice averageRating numOfRatings previewUrl createdAt purchaseCount downloadCount originalArtist backingTrackType genre user')
            .sort(sort)
            .skip(skip)
            .limit(limitNum)            .populate('user', 'avatar username');

        // Calculate pagination metadata
        const totalPages = Math.ceil(totalTracks / limitNum);

        // Convert to track summary format with proper ID mapping
        const { toTrackSummary } = await import('../utils/trackSummary.js');
        const summaryTracks = toTrackSummary(tracks);

        return res.status(200).json({ 
            tracks: Array.isArray(summaryTracks) ? summaryTracks : [],
            pagination: {
                currentPage: pageNum,
                totalPages: totalPages,
                totalTracks: totalTracks,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
                limit: limitNum
            }
        });
    } catch (error) {
        console.error('Error fetching uploaded tracks by userId:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

/**
 * Edit a backing track
 * @param {Express.Request & {userId: string, params: {id: string}, body: TrackEditRequest}} req - Express request with auth and track edit data
 * @param {Express.Response} res - Express response
 * @returns {Promise<APIResponse>} Promise resolving to API response with updated track
 */
export async function editTrack(req, res) {
    try {
        // Validate request body
        const { error, value } = editTrackSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ message: error.details[0].message });
        }

        const profanity = new Filter.Filter();
        
        // Find the user
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
          // Find the track
        const track = await BackingTrack.findById(req.params.id);
        if (!track) {
            return res.status(404).json({ message: 'Track not found' });
        }
        
        // Check ownership
        if (track.user.toString() !== user._id.toString()) {
            return res.status(403).json({ message: "You are not authorized to edit this track" });
        }
        
        // Extract validated fields from value
        const { description, title, originalArtist, instructions, youtubeGuideUrl, guideTrackUrl, licenseStatus, licensedFrom, price, backingTrackType, genre, vocalRange } = value;
        
        // Validate and parse price if present
        let parsedPrice = track.price; // Default to existing price
        if (price !== undefined) { // Check if price is explicitly provided in the request
            if (price === null || price === '') { // Allow unsetting price or setting to 0
                 parsedPrice = 0;
            } else {
                parsedPrice = parseFloat(price);
                if (isNaN(parsedPrice) || parsedPrice < 0) {
                    return res.status(400).json({ message: 'Price must be a valid positive number or zero' });
                }
            }
        }

        // Conditional validation for licensedFrom
        if (licenseStatus === 'licensed') {
            if (!licensedFrom || typeof licensedFrom !== 'string' || licensedFrom.trim() === '') {
                return res.status(400).json({ message: 'Licensed from must be a non-empty string when licenseStatus is "licensed".' });
            }
        } else if (licenseStatus === 'unlicensed' || licenseStatus === 'not_required') {
            // If changing to unlicensed or not_required, clear licensedFrom
            if (Object.prototype.hasOwnProperty.call(value, 'licenseStatus') && !Object.prototype.hasOwnProperty.call(value, 'licensedFrom')) {
                 track.licensedFrom = '';
            }
        }


        // Create object with field names and values for easier iteration
        // Only include fields that were actually in the validated 'value' object
        const fieldsToUpdate = {};
        if (description !== undefined) fieldsToUpdate.description = description;
        if (title !== undefined) fieldsToUpdate.title = title;
        if (originalArtist !== undefined) fieldsToUpdate.originalArtist = originalArtist;
        if (instructions !== undefined) fieldsToUpdate.instructions = instructions;
        if (youtubeGuideUrl !== undefined) fieldsToUpdate.youtubeGuideUrl = youtubeGuideUrl;
        if (guideTrackUrl !== undefined) fieldsToUpdate.guideTrackUrl = guideTrackUrl;
        if (licenseStatus !== undefined) fieldsToUpdate.licenseStatus = licenseStatus;
        if (licensedFrom !== undefined) fieldsToUpdate.licensedFrom = licensedFrom;
        if (price !== undefined) fieldsToUpdate.price = parsedPrice; // Use parsedPrice
        if (backingTrackType !== undefined) fieldsToUpdate.backingTrackType = backingTrackType;
        if (genre !== undefined) fieldsToUpdate.genre = genre;
        if (vocalRange !== undefined) fieldsToUpdate.vocalRange = vocalRange;
        
        // Check profanity and update fields
        for (const [fieldName, fieldValue] of Object.entries(fieldsToUpdate)) {
            // fieldValue can be an empty string (e.g. for instructions), so we don't check for empty string here
            // null or undefined means the field was not provided or explicitly set to null by Joi's .optional()
            if (fieldValue !== undefined) { 
                let sanitizedValue = fieldValue;
                if (typeof fieldValue === 'string') {
                    if (profanity.isProfane(fieldValue)) {
                        return res.status(400).json({ message: `Please avoid inappropriate language in the ${fieldName} field` });
                    }
                    sanitizedValue = fieldValue.replace(/<[^>]*>/g, '').trim();
                }
                
                track[fieldName] = sanitizedValue;
            }
        }
          // Save the updated track
        await track.save();
        
        // Return limited track info (don't expose sensitive data)
        return res.status(200).json({ 
            message: 'Track updated successfully',
            track: {
                _id: track._id,
                title: track.title,
                description: track.description,
                price: track.price,
                originalArtist: track.originalArtist,
                backingTrackType: track.backingTrackType,
                genre: track.genre,
                vocalRange: track.vocalRange,
                updatedAt: track.updatedAt
            }
        });
        
    } catch (error) {
        console.error('Error editing track:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
}