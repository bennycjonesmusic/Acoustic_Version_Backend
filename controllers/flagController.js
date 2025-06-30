import BackingTrack from "../models/backing_track.js";
import User from "../models/User.js";
import { isSafeRegexInput } from '../utils/regexSanitizer.js';





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
        const track = await BackingTrack.findById(req.params.trackId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        if (!track) {
            return res.status(404).json({ message: 'Track not found.' });
        }
        // Find the flag
        const flagIndex = track.flags.findIndex(flag => flag.user.toString() === user._id.toString());
        if (flagIndex === -1) {
            return res.status(404).json({ message: 'Flag not found for this user.' });
        }
        // Allow user to delete their own flag, or admin to delete any
        if (track.flags[flagIndex].user.toString() !== user._id.toString() && user.role !== 'admin') {
            return res.status(403).json({ message: 'Not authorized to delete this flag.' });
        }
        track.flags.splice(flagIndex, 1);
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
        const track = await BackingTrack.findById(req.params.trackId);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Admin privileges required.' });
        }
        if (!track) {
            return res.status(404).json({ message: 'Track not found.' });
        }
        const flag = track.flags.id(req.params.flagId);
        if (!flag) {
            return res.status(404).json({ message: 'Flag not found.' });
        }
        flag.reviewed = true;
        await track.save();
        return res.status(200).json({ message: 'Flag marked as reviewed.' });
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
        const tracks = await BackingTrack.find({ 'flags.0': { $exists: true } })
            .populate('flags.user', 'username email')
            .select('title originalArtist flags');
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
        return res.status(200).json({ flags: allFlags });
    } catch (error) {
        console.error('Error fetching all flags:', error);
        return res.status(500).json({ message: 'Failed to fetch all flags' });
    }
};