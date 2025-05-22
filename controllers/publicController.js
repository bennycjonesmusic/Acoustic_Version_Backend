import fs from 'fs';
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'; //going to use in register as well, to authenticate email
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
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

     let users = await User.find({$text: {$search : query}}).sort({score: {$meta: 'textScore'}})
        .skip(skip).limit(limit).select({ score: { $meta: 'textScore' } }); 

         if (!users.length) {
      users = await User.find({
        username: { $regex: query, $options: 'i' }
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
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Use schema transform with viewerRole/viewerId if available
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

    try {

        //get popular and recent tracks
        const popularTracks = await BackingTrack.find().sort({ purchaseCount: -1}).limit(10);
        const recentTracks = await BackingTrack.find().sort({ createdAt: -1}).limit(10);
        
        // exclude popular and recent tracks from the random selection
        const excludeIds = [
            ...popularTracks.map(track => track._id),
            ...recentTracks.map(track => track._id)

        ];
        const randomTracks = await BackingTrack.aggregate([ { $match: {_id: {$nin: excludeIds} } }, { $sample: {size: 5} }]);

        const featured = [...popularTracks, ...randomTracks, ...recentTracks];
        return res.status(200).json(toTrackSummary(featured));


    } catch (error) {
        console.error('Error getting featured tracks:', error);
        return res.status(500).json({message: "Internal server error"});





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
                return res.status(400).json({ error: "Something went wrong. Make sure you enter valid vocal range" });
            }
        }
        const tracks = await BackingTrack.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
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
        let tracks = await BackingTrack.find({ $text: { $search: query } })
            .sort({ score: { $meta: 'textScore' } })
            .skip(skip)
            .limit(limit)
            .select({ score: { $meta: 'textScore' } });
        if (!tracks.length) {
            tracks = await BackingTrack.find({
                title: { $regex: query, $options: 'i' }
            })
                .skip(skip)
                .limit(limit);
        }
        const summaryTracks = toTrackSummary(tracks);
        return res.status(200).json(summaryTracks);
    } catch (error) {
        return res.status(500).json({ message: "server error querying tracks" });
    }
};

export const getTrack = async (req, res) => {
    try {
        if (!req.params.id) {
            return res.status(400).json({ message: 'Please insert a trackId' });
        }
        const track = await BackingTrack.findById(req.params.id);
        if (!track) {
            return res.status(404).json({ message: 'Track not found' });
        }
        return res.status(200).json(track.toJSON({
            viewerRole: req.user?.role || 'public',
            viewerId: req.userId || null
        }));
    } catch (error) {
        return res.status(500).json({ message: 'Internal server error' });
    }
};