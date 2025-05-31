import fs from 'fs';
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'; //going to use in register as well, to authenticate email
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import CommissionRequest from '../models/CommissionRequest.js';
import * as Filter from 'bad-words'; //package to prevent profanity
import zxcvbn from 'zxcvbn'; //package for password strength
import { validateEmail } from '../utils/emailValidator.js';
import { sendVerificationEmail } from '../utils/emailAuthentication.js';
import { toTrackSummary } from '../utils/trackSummary.js';
import { toUserSummary } from '../utils/userSummary.js';





export const searchUserByName = async (req, res) => {

try {
//using this so wont throw error if not logged in :) still want to function as a public route
    let searcher = null;
    if (req.userId) {
      searcher = await User.findById(req.userId);
    }

const {query, page = 1} = req.query; //destructure query and page from req.query
 
if (! query){

    return res.status(400).json({message: "Search query is required"}); //if no query prompt to add query

}

   


   const limit = 10;
    const skip = (page - 1) * limit;

     let users = await User.find({$text: {$search : query}, role: 'artist', profileStatus: 'approved', 'artistExamples.0': { $exists: true }}).sort({score: {$meta: 'textScore'}})
        .skip(skip).limit(limit).select({ score: { $meta: 'textScore' } }); 

         if (!users.length) {
      users = await User.find({
        username: { $regex: query, $options: 'i' },
        role: 'artist',
        profileStatus: 'approved',
        'artistExamples.0': { $exists: true }
      })
        .skip(skip)
        .limit(limit);
    }

        // Only return summary info for each user
        return res.status(200).json({ users: toUserSummary(users) });
        

    }

catch (error) {
    console.error('Error searching user by name:', error);
    return res.status(500).json({ message: "Internal server error" });
}


}

export const getUserDetails = async (req, res) => {
    try {
        // Populate uploadedTracks if artist/admin
        let user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Only populate uploadedTracks for artists/admins... probably redundant since viewerRole edits this out in the toJSON method, but just to be sure.
        if (user.role === 'artist' || user.role === 'admin') {
            // Only show public tracks to public viewers
            const isSelfOrAdmin = req.userId && (req.userId === user._id.toString() || req.user?.role === 'admin');
            await user.populate({
                path: 'uploadedTracks',
                match: isSelfOrAdmin ? {} : { isPrivate: false },
                select: 'title previewUrl fileUrl createdAt averageRating purchaseCount',
                options: { sort: { createdAt: -1 } }
            });
        }
        return res.status(200).json(user.toJSON({
            viewerRole: req.user?.role || 'public',
            viewerId: req.userId || null
        }));
    } catch (error) {
        console.error('Error getting user details:', error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// --- PUBLIC TRACK ENDPOINTS MOVED FROM tracksController.js ---

export const getFeaturedTracks = async (req, res) => {
    console.log('[getFeaturedTracks] ENTERED');
    // get popular and recent tracks
    const popularTracks = await BackingTrack.find({ isPrivate: false }).sort({ purchaseCount: -1 }).limit(10).populate('user', 'avatar username');
    console.log('[getFeaturedTracks] popularTracks:', popularTracks.length);
    const recentTracks = await BackingTrack.find({ isPrivate: false }).sort({ createdAt: -1 }).limit(10).populate('user', 'avatar username');
    console.log('[getFeaturedTracks] recentTracks:', recentTracks.length);

    // exclude popular and recent tracks from the random selection
    let excludeIds = [
        ...popularTracks.map(track => track._id),
        ...recentTracks.map(track => track._id)
    ];
    excludeIds = excludeIds.filter(id => id && typeof id.equals === 'function');
    console.log('[getFeaturedTracks] excludeIds:', excludeIds.length);

    // If all tracks are excluded, skip aggregation
    const totalTracks = await BackingTrack.countDocuments({ isPrivate: false });
    console.log('[getFeaturedTracks] totalTracks:', totalTracks);
    if (excludeIds.length >= totalTracks) {
        const featured = [...popularTracks, ...recentTracks];
        const filtered = featured.filter(Boolean);
        console.log('[getFeaturedTracks] returning early, filtered.length:', filtered.length);
        return res.status(200).json(toTrackSummary(filtered));
    }

    // isPrivate:false must be inside $match
    let randomTracks = [];
    randomTracks = await BackingTrack.aggregate([
        { $match: { _id: { $nin: excludeIds }, isPrivate: false } },
        { $sample: { size: 5 } }
    ]);
    console.log('[getFeaturedTracks] randomTracks:', randomTracks.length);
    const randomTrackIds = randomTracks.map(track => track._id).filter(id => id);
    console.log('[getFeaturedTracks] randomTrackIds:', randomTrackIds.length);
    let randomTracksPopulated = [];
    if (randomTrackIds.length > 0) {
        randomTracksPopulated = await BackingTrack.find({ _id: { $in: randomTrackIds } }).populate('user', 'avatar username');
        console.log('[getFeaturedTracks] randomTracksPopulated:', randomTracksPopulated.length);
    }
    // Merge all tracks
    const featured = [...popularTracks, ...randomTracksPopulated, ...recentTracks];
    const filtered = featured.filter(Boolean);
    console.log('[getFeaturedTracks] final filtered.length:', filtered.length);
    return res.status(200).json(toTrackSummary(filtered));
}

export const getFeaturedArtists = async (req, res) => {
    try {
        // Find artists with at least one uploaded track OR at least one commission as artist, and approved profile
        const featuredArtists = await User.find({
            role: 'artist',
            profileStatus: 'approved',
            $or: [
                { uploadedTracks: { $exists: true, $not: { $size: 0 } } },
                // Artists with at least one commission as artist
                { _id: { $in: await CommissionRequest.distinct('artist') } }
            ]
        }).limit(10);
        // Exclude those already found from random selection
        const excludeIds = featuredArtists.map(a => a._id);
        // Find random additional artists with same criteria
        const commissionArtistIds = await CommissionRequest.distinct('artist');
        const featureRandom = await User.aggregate([
            { $match: {
                _id: { $nin: excludeIds },
                role: 'artist',
                profileStatus: 'approved',
                $or: [
                    { uploadedTracks: { $exists: true, $not: { $size: 0 } } },
                    { _id: { $in: commissionArtistIds } }
                ]
            } },
            { $sample: { size: 5 } }
        ]);
        const featured = [...featuredArtists, ...featureRandom]; //Merge the arrays in a super array.
        return res.status(200).json(toUserSummary(featured))
    } catch (error) {
        console.error('Error getting featured artists:', error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

export const queryTracks = async (req, res) => {
    try {
        const { orderBy, page = 1, limit = 10, keySig, "vocal-range": vocalRange } = req.query;
        let sort = {};
        let filter = {};
        if (orderBy == "popularity") sort = { purchaseCount: -1 };
        if (orderBy == "date-uploaded") sort = { createdAt: -1 };
        if (orderBy == "date-uploaded/ascending") sort = { createdAt: 1 };
        if (orderBy == "rating") sort = { averageRating: -1 };
        if (keySig) {
            try {
                const { key, isFlat, isSharp } = parseKeySignature(keySig);
                filter.key = key;
                if (isFlat) filter.isFlat = true;
                if (isSharp) filter.isSharp = true;
            } catch (error) {
                return res.status(400).json({ error: error.message });
            }
        }
        if (vocalRange) {
            try {
                filter.vocalRange = vocalRange;
            } catch (error) {
                return res.status(400).json({ error: "Something went wrong. Make sure you enter a valid vocal range" });
            }
        }
        if (req.query.artistId) {
            filter.user = req.query.artistId;
        }//filter by artist
        filter.isPrivate = false; //show show public tracks only
        const tracks = await BackingTrack.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).populate('user', 'avatar username');
        if (!tracks || tracks.length === 0) {
            return res.status(404).json({ message: "No tracks found." });
        }
        const summaryTracks = toTrackSummary(tracks);
        return res.status(200).json(summaryTracks);
    } catch (error) {
        return res.status(500).json({ error: "Failed to query tracks" });
    }
};

export const searchTracks = async (req, res) => {
    try {
        const { query, page = 1 } = req.query;
        if (!query) {
            return res.status(400).json({ message: "search query is required" });
        }
        const limit = 10;
        const skip = (page - 1) * limit;
        let tracks = await BackingTrack.find({ $text: { $search: query }, isPrivate: false})
            .sort({ score: { $meta: 'textScore' } })
            .skip(skip)
            .limit(limit)
            .select({ score: { $meta: 'textScore' } })
            .populate('user', 'avatar username'); //we want to be able to display a picture for the tracks
        if (!tracks.length) {
            tracks = await BackingTrack.find({
                title: { $regex: query, $options: 'i' },
                isPrivate: false
            })
                .skip(skip)
                .limit(limit)
                .populate('user', 'avatar username');
        }
        const summaryTracks = toTrackSummary(tracks);
        return res.status(200).json(summaryTracks);
    } catch (error) {
        return res.status(500).json({ message: "server error querying tracks" });
    }
};

//find and get a track by id
export const getTrack = async (req, res) => {
    try {

        const user = req.userId ? await User.findById(req.userId) : null;
        

     
        if (!req.params.id) {
            return res.status(400).json({ message: 'Please insert a trackId' });
        }
        const track = await BackingTrack.findById(req.params.id);
        if (!track) {
            return res.status(404).json({ message: 'Track not found' });
        }
        return res.status(200).json(track.toJSON({
            viewerRole: req.user?.role || 'public',
            viewerId: req.userId || null,
            purchasedTrackIds: user?.purchasedTracks || []
        }));
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};