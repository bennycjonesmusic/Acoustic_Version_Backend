import BackingTrack from "../models/backing_track.js";
import User from "../models/User.js";
import { isSafeRegexInput } from '../utils/regexSanitizer.js';
import { createArtistRejectedNotification, createTrackRejectedNotification, createTrackTakedownNotification } from '../utils/notificationHelpers.js';





export const flagTrack = async (req, res) => {

        try {

            const user = await User.findById(req.userId);
            const track = await BackingTrack.findById(req.params.trackId);

            if (!user) {
                return res.status(404).json({ message: 'User not found. Please create an account, or flag via contact form.' });
            }
            if (!track) {
                return res.status(404).json({ message: 'Track not found. Please check the track ID and try again.' });
            }

            // Determine flag type
            const flagType = req.body.type === 'copyright' || req.body.type === 'dmca' ? req.body.type : 'other';

            // Reason is required for all types
            if (!req.body.reason || req.body.reason.trim() === '') {
                return res.status(400).json({ message: 'Reason cannot be empty.' });
            }

            if (!isSafeRegexInput(req.body.reason, 200)) {
                return res.status(400).json({ message: 'Reason contains invalid or unsafe characters.' });
            }
            
            const alreadyFlagged = track.flags.some(flag => flag.user.toString() === user._id.toString());
            if (alreadyFlagged) {
                return res.status(400).json({ message: 'You have already flagged this track.' });
            }

            const id = user._id || user.id;
            track.flags.push({
                user: id,
                type: flagType,
                reason: req.body.reason,
                createdAt: new Date(),
                reviewed: false,
            });

            track.flagCount = (track.flagCount || 0) + 1; 
            track.isFlagged = true; // Mark track as flagged
            await track.save();

            return res.status(200).json({ message: 'Track has been flagged. An admin will review it shortly.' });
        } catch (error) {
            console.error('There was an error in trying to flag the track:', error);
            return res.status(500).json({ message: 'Failed to flag track' });
        }



   




}

// Delete a flag from a track (user or admin)
export const deleteFlag = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin privileges required.' });
        }

        const flagId = req.params.flagId;
        
        // Find the track that contains this flag
        const track = await BackingTrack.findOne({ 'flags._id': flagId });
        if (!track) {
            return res.status(404).json({ message: 'Flag not found.' });
        }

        const flag = track.flags.id(flagId);
        if (!flag) {
            return res.status(404).json({ message: 'Flag not found.' });
        }

        // Remove the flag
        track.flags.pull(flagId);
        track.flagCount = Math.max(0, (track.flagCount || 0) - 1);
        await track.save();

        return res.status(200).json({ message: 'Flag deleted successfully.' });
    } catch (error) {
        console.error('Error deleting flag:', error);
        return res.status(500).json({ message: 'Failed to delete flag' });
    }
};

// Admin: mark a flag as reviewed
export const reviewFlag = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin privileges required.' });
        }

        const flagId = req.params.flagId;
        
        // Find the track that contains this flag
        const track = await BackingTrack.findOne({ 'flags._id': flagId });
        if (!track) {
            return res.status(404).json({ message: 'Flag not found.' });
        }

        const flag = track.flags.id(flagId);
        if (!flag) {
            return res.status(404).json({ message: 'Flag not found.' });
        }

        // Update flag with review status and admin notes
        flag.reviewed = req.body.reviewed !== undefined ? req.body.reviewed : true;
        if (req.body.adminNotes) {
            flag.adminNotes = req.body.adminNotes;
        }

        await track.save();
        return res.status(200).json({ message: 'Flag reviewed successfully.' });
    } catch (error) {
        console.error('Error reviewing flag:', error);
        return res.status(500).json({ message: 'Failed to review flag' });
    }
};

// Admin: get all flags for a track
export const getFlagsForTrack = async (req, res) => {
    try {
        const track = await BackingTrack.findById(req.params.trackId).populate('flags.user', 'username email');
        if (!track) {
            return res.status(404).json({ message: 'Track not found.' });
        }
        return res.status(200).json({ flags: track.flags });
    } catch (error) {
        console.error('Error fetching flags for track:', error);
        return res.status(500).json({ message: 'Failed to fetch flags' });
    }
};

// Admin: get all flags for all tracks
export const getAllFlags = async (req, res) => {
    try {
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Get total count of tracks with flags
        const totalTracksWithFlags = await BackingTrack.countDocuments({ 'flags.0': { $exists: true } });

        // Get paginated tracks with flags
        const tracks = await BackingTrack.find({ 'flags.0': { $exists: true } })
            .populate('flags.user', 'username email')
            .select('title originalArtist flags')
            .skip(skip)
            .limit(limit)
            .sort({ 'flags.createdAt': -1 }); // Sort by newest flags first

        // Flatten all flags with track info
        const allFlags = [];
        for (const track of tracks) {
            for (const flag of track.flags) {
                allFlags.push({
                    trackId: track._id,
                    trackTitle: track.title,
                    originalArtist: track.originalArtist,
                    ...flag.toObject(),
                });
            }
        }

        // Calculate total pages based on individual flags count
        // Note: This is an approximation since we're paginating by tracks, not individual flags
        const totalPages = Math.ceil(totalTracksWithFlags / limit);

        return res.status(200).json({ 
            flags: allFlags,
            currentPage: page,
            totalPages: totalPages,
            totalTracks: totalTracksWithFlags,
            totalFlags: allFlags.length
        });
    } catch (error) {
        console.error('Error fetching all flags:', error);
        return res.status(500).json({ message: 'Failed to fetch all flags' });
    }
};

// Admin: Copyright takedown a track (soft delete)
export const adminTakedownTrack = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin privileges required.' });
    }
    const track = await BackingTrack.findById(req.params.trackId);
    if (!track) {
      return res.status(404).json({ message: 'Track not found.' });
    }
    // Soft delete: mark as deleted and optionally log takedown reason
    track.isDeleted = true;
    track.takedownReason = req.body.reason || 'Copyright takedown';
    await track.save();
    // Notify uploader (artist) of takedown
    try {
      if (track.user) {
        await createTrackTakedownNotification(track.user, track._id, track.title, track.takedownReason);
      }
    } catch (notifError) {
      console.error('Error sending takedown notification:', notifError);
    }
    return res.status(200).json({ message: 'Track has been taken down for copyright reasons.' });
  } catch (error) {
    console.error('Error in admin copyright takedown:', error);
    return res.status(500).json({ message: 'Failed to takedown track' });
  }
};