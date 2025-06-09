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
import {escapeRegex, isSafeRegexInput, sanitizeFileName} from '../utils/regexSanitizer.js';
import mongoose from 'mongoose';
import NodeCache from 'node-cache';
const cache = new NodeCache({ stdTTL: 60 * 60 }); //cache for 1 hour

/** * @typedef {Object} TrackSummary
 * @property {string} id - Track ID
 * @property {string} title - Track title
 * @property {UserSummary|string} user - User who uploaded (summary object if populated, ObjectId string if not)
 * @property {string} originalArtist - Original artist name
 * @property {number} customerPrice - Track price
 */

/**
 * @typedef {Object} UserSummary
 * @property {string} id - User ID
 * @property {string} username - Username
 * @property {string} [avatar] - Avatar URL
 */

/**
 * @typedef {Object} PublicAPIResponse
 * @property {string} [message] - Response message
 * @property {TrackSummary[]} [tracks] - Array of track summaries
 * @property {UserSummary[]} [users] - Array of user summaries
 * @property {TrackSummary} [track] - Single track summary
 * @property {UserSummary} [user] - Single user summary
 * @property {string} [error] - Error message
 */

/**
 * @typedef {Object} SearchQuery
 * @property {string} query - Search term
 * @property {string|number} [page] - Page number for pagination
 * @property {string|number} [limit] - Results per page limit
 */

/**
 * @typedef {Object} TrackQueryParams
 * @property {'popularity'|'date-uploaded'|'date-uploaded/ascending'|'rating'} [orderBy] - Sort order
 * @property {string|number} [page] - Page number for pagination
 * @property {string|number} [limit] - Results per page limit
 * @property {string} [keySig] - Key signature filter
 * @property {string} [vocal-range] - Vocal range filter
 * @property {string} [artistId] - Artist ID filter
 */

/**
 * @typedef {Object} PublicRequest
 * @property {string} [userId] - Authenticated user ID (optional for public routes)
 * @property {Object} [user] - Authenticated user object (optional)
 * @property {Object} params - URL parameters
 * @property {Object} query - Query parameters
 */

// Profanity filter instance (bad-words)
const profanityFilter = new Filter.Filter();

/**
 * Search for users by name with text search and regex fallback
 * @param {Express.Request & PublicRequest & {query: SearchQuery}} req - Express request with search parameters
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with user summaries
 */
export const searchUserByName = async (req, res) => {
    try {
        let searcher = null;
        if (req.userId) {
            searcher = await User.findById(req.userId);
        }
        const { query, page = 1 } = req.query;
        // 1. Check for query existence first
        if (!query) {
            return res.status(400).json({ message: "Search query is required" });
        }
        // 2. Validate query for regex safety
        if (!isSafeRegexInput(query)) {
            return res.status(400).json({ message: "Invalid search query" });
        }
        // Profanity check for search query
        if (profanityFilter.isProfane(query)) {
            return res.status(400).json({ message: "Inappropriate search query" });
        }
        // 3. Validate and sanitize pagination
        let pageNum = parseInt(page, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        const limit = 10;
        const skip = (pageNum - 1) * limit;        // 4. Use raw query for $text search
        let users = await User.find({ $text: { $search: query }, role: { $in: ['artist', 'admin'] }, profileStatus: 'approved' })
            .sort({ score: { $meta: 'textScore' } })
            .skip(skip).limit(limit);
        if (!users.length) {
            // 5. Use escaped query for $regex fallback
            const safeQuery = escapeRegex(query);            users = await User.find({
                username: { $regex: safeQuery, $options: 'i' },
                role: { $in: ['artist', 'admin'] },
                profileStatus: 'approved'
            })
                .skip(skip)
                .limit(limit);
        }
        return res.status(200).json({ users: toUserSummary(users) });
    } catch (error) {
        console.error('Error searching user by name:', error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * Get detailed information about a specific user
 * @param {Express.Request & PublicRequest & {params: {id: string}, query: {page?: string, limit?: string, sort?: string, search?: string}}} req - Express request with user ID parameter, pagination, and filtering
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with user details
 */
export const getUserDetails = async (req, res) => {
    try {
        // Validate user ID
        if (!mongoose.Types.ObjectId.isValid(req.params.id)){
            return res.status(400).json({ message: "Invalid user ID" }); //sanitize inputs to prevent injection attacks.
        }
        
        let user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Parse pagination and filtering parameters for uploaded tracks
        const { page = 1, limit = 10, sort = 'recent', search = '' } = req.query;
        let pageNum = parseInt(page, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        let limitNum = parseInt(limit, 10);
        if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
        if (limitNum > 50) limitNum = 50; // Cap at 50 tracks per page
        const skip = (pageNum - 1) * limitNum;     
        
        // Always populate uploadedTracks, but filter based on privacy and viewer permissions
        const isSelfOrAdmin = req.userId && (req.userId === user._id.toString() || req.user?.role === 'admin');
          // Build match conditions for tracks - show public tracks to everyone, private tracks only to owner/admin
        let matchConditions = isSelfOrAdmin ? {} : { isPrivate: false };        // Add search filter if provided
        if (search && search.trim()) {
            const searchTerm = search.trim();
            // Use regex search for title matching - more reliable than text search
            const safeQuery = escapeRegex(searchTerm);
            matchConditions.title = { $regex: safeQuery, $options: 'i' };
        }
          // Determine sort order
        let sortOption = { createdAt: -1 }; // Default: recently uploaded
        if (sort === 'popularity') {
            sortOption = { averageRating: -1, createdAt: -1 }; // Sort by rating, then by recency
        }
        
        await user.populate({
            path: 'uploadedTracks',
            match: matchConditions,
            select: 'title previewUrl fileUrl createdAt averageRating purchaseCount',
            options: { 
                sort: sortOption,
                skip: skip,
                limit: limitNum
            }
        });
        
        // Get total count of tracks for pagination metadata
        let totalTracks = 0;
        let countMatchCondition = isSelfOrAdmin ? {} : { isPrivate: false };
          // Add search filter to count query if provided
        if (search && search.trim()) {
            const searchTerm = search.trim();
            // Use regex search for title matching - more reliable than text search
            const safeQuery = escapeRegex(searchTerm);
            countMatchCondition.title = { $regex: safeQuery, $options: 'i' };
        }
        
        totalTracks = await BackingTrack.countDocuments({
            user: user._id,
            ...countMatchCondition
        });

        const userJson = user.toJSON({
            viewerRole: req.user?.role || 'public',
            viewerId: req.userId || null
        });        // Add pagination metadata for uploaded tracks (if there are any tracks to show)
        if (totalTracks > 0) {
            const totalPages = Math.ceil(totalTracks / limitNum);
            userJson.uploadedTracksPagination = {
                currentPage: pageNum,
                totalPages: totalPages,
                totalTracks: totalTracks,
                hasNextPage: pageNum < totalPages,
                hasPrevPage: pageNum > 1,
                limit: limitNum
            };
        }

        return res.status(200).json(userJson);
    } catch (error) {
        console.error('Error getting user details:', error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

// --- PUBLIC TRACK ENDPOINTS MOVED FROM tracksController.js ---

/**
 * Get featured tracks for the public homepage, including popular, recent, and random tracks
 * @param {Express.Request} req - Express request
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with featured tracks
 */
/**
 * Get featured tracks for the public homepage, including popular, recent, and random tracks
 * @param {Express.Request} req - Express request
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with featured tracks
 */
export const getFeaturedTracks = async (req, res) => {
    //check the ole cachearoo, make sure we don't hit the database TOO much
    const cached = cache.get('featuredTracks');
    if (cached) {


        console.log('[getFeaturedTracks] Returning cached data');
        return res.status(200).json(cached); //if we have cached data, return it. simples.
    }
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
    console.log('[getFeaturedTracks] totalTracks:', totalTracks);    if (excludeIds.length >= totalTracks) {
        const featured = [...popularTracks, ...recentTracks];
        const filtered = featured.filter(Boolean);
        
        // Debug: Check if user data is populated in early return
        console.log('[getFeaturedTracks] Early return - Sample track user data:', filtered[0]?.user);
        
        const summary = toTrackSummary(filtered);
        
        // Debug: Check summary output in early return
        console.log('[getFeaturedTracks] Early return - Sample summary user data:', summary[0]?.user);
        
        cache.set('featuredTracks', summary);
        console.log('[getFeaturedTracks] returning early, filtered.length:', filtered.length);
        return res.status(200).json(summary);
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
    }    // Merge all tracks
    const featured = [...popularTracks, ...randomTracksPopulated, ...recentTracks];
    const filtered = featured.filter(Boolean);
    
    // Debug: Check if user data is populated
    console.log('[getFeaturedTracks] Sample track user data:', filtered[0]?.user);
    
    const summary = toTrackSummary(filtered);
    
    // Debug: Check summary output
    console.log('[getFeaturedTracks] Sample summary user data:', summary[0]?.user);
    
    cache.set('featuredTracks', summary);
    console.log('[getFeaturedTracks] final filtered.length:', filtered.length);
    return res.status(200).json(summary);
}

/**
 * Get a list of featured artists for the public homepage, including those with uploaded tracks or commission requests
 * @param {Express.Request} req - Express request
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with featured artists
 */
/**
 * Get a list of featured artists for the public homepage, including those with uploaded tracks or commission requests
 * @param {Express.Request} req - Express request
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with featured artists
 */
export const getFeaturedArtists = async (req, res) => {
    console.log('=== FEATURED ARTISTS ENDPOINT HIT ===');
    console.log('Request URL:', req.url);
    console.log('Request method:', req.method);
    try {        // Check cache first
        const cached = cache.get('featuredArtists');
        if (cached) {
            console.log('[getFeaturedArtists] Returning cached data', cached[0]);
            return res.status(200).json(cached);
        }
        console.log('[getFeaturedArtists] No cache found, fetching fresh data');        // Find artists or admins with at least one uploaded track OR at least one commission as artist, and approved profile
        const featuredArtists = await User.find({
            role: { $in: ['artist', 'admin'] },
            profileStatus: 'approved',
            $or: [
                { uploadedTracks: { $exists: true, $not: { $size: 0 } } },
                // Artists/admins with at least one commission as artist
                { _id: { $in: await CommissionRequest.distinct('artist') } }
            ]
        }).limit(10);
        // Exclude those already found from random selection
        const excludeIds = featuredArtists.map(a => a._id);        // Find random additional artists/admins with same criteria
        const commissionArtistIds = await CommissionRequest.distinct('artist');        const featureRandom = await User.aggregate([
            { $match: {
                _id: { $nin: excludeIds },
                role: { $in: ['artist', 'admin'] },
                profileStatus: 'approved',
                $or: [
                    { uploadedTracks: { $exists: true, $not: { $size: 0 } } },
                    { _id: { $in: commissionArtistIds } }
                ]
            } },
            { $sample: { size: 5 } }
        ]);const featured = [...featuredArtists, ...featureRandom]; //Merge the arrays in a super array.
        console.log('[getFeaturedArtists] Raw featured artists data:', featured[0]);
        
        // Calculate average track rating for all featured artists
        console.log('[getFeaturedArtists] Calculating average track ratings for featured artists...');
        for (const artist of featured) {
            try {
                await artist.calculateAverageTrackRating(); 
            
                await artist.save(); //ensures customercommission gets updated
                console.log(`[getFeaturedArtists] Updated rating for ${artist.username}: ${artist.averageTrackRating}`);
            } catch (error) {
                console.error(`[getFeaturedArtists] Error calculating rating for ${artist.username}:`, error);
            }
        }
        
        const summary = toUserSummary(featured);
        console.log('[getFeaturedArtists] After toUserSummary:', summary[0]);        cache.set('featuredArtists', summary);
        return res.status(200).json(summary);
    } catch (error) {
        console.error('Error getting featured artists:', error);
        return res.status(500).json({ message: "Internal server error" });
    }
}

/**
 * Query tracks with filters for popularity, upload date, rating, and more
 * @param {Express.Request & PublicRequest & {query: TrackQueryParams}} req - Express request with query parameters
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with track summaries
 */
/**
 * Query tracks with filters for popularity, upload date, rating, and more
 * @param {Express.Request & PublicRequest & {query: TrackQueryParams}} req - Express request with query parameters
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with track summaries
 */

export const queryUsers = async (req, res) => {
    try {
        const { orderBy, page = 1, limit = 10, lastOnlineWithin, minCommissions, availableForCommission, query } = req.query;
        let sort = {};
        let filter = {};
        // Validate and sanitize pagination
        let pageNum = parseInt(page, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        let limitNum = parseInt(limit, 10);
        if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
        if (limitNum > 50) limitNum = 50;
        if (orderBy == "rating") sort = { averageTrackRating: -1 };
        if (orderBy == "date-joined") sort = { createdAt: -1 };
        if (orderBy == "date-joined/ascending") sort = { createdAt: 1 };
        if (orderBy == "commission-price") sort = { customerCommissionPrice: 1 };
        if (orderBy == "num-of-commissions") sort = { numOfCommissions: -1 };
        if (orderBy == "num-of-commissions/ascending") sort = { numOfCommissions: 1 };
        if (orderBy == "popularity") sort = { amountOfTracksSold: -1 };
        if (orderBy == "num-of-uploaded-tracks") sort = { numOfUploadedTracks: -1 };
        // Filter for users who were online within X days
        if (lastOnlineWithin) {
            const daysNum = parseInt(lastOnlineWithin, 10);
            if (!isNaN(daysNum) && daysNum > 0) {
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - daysNum);
                filter.lastOnline = { $gte: cutoffDate };
            }
        }
        // Filter for users who have completed at least X commissions
        if (minCommissions) {
            const commissionsNum = parseInt(minCommissions, 10);
            if (!isNaN(commissionsNum) && commissionsNum >= 0) {
                filter.numOfCommissions = { $gte: commissionsNum };
            }
        }
        // Filter for users who are available for commissions
        if (availableForCommission) {
            if (availableForCommission === 'true') {
                filter.availableForCommission = true;
            } else if (availableForCommission === 'false') {
                filter.availableForCommission = false;
            }
        }
        filter.role = { $in: ['artist', 'admin'] }; // Show only artists and admins
        filter.profileStatus = 'approved'; // Show only approved users

        let users;
        let totalUsers;
        // If a search query is present, do a text/regex search, then filter/sort
        if (query) {
            if (!isSafeRegexInput(query)) {
                return res.status(400).json({ message: "Invalid search query" });
            }
            // Try $text search first
            const textFilter = { $text: { $search: query }, ...filter };
            users = await User.find(textFilter)
                .sort(Object.keys(sort).length ? { ...sort, score: { $meta: 'textScore' } } : { score: { $meta: 'textScore' } })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .select({ score: { $meta: 'textScore' } });
            totalUsers = await User.countDocuments(textFilter);
            if (!users.length) {
                // Fallback to regex search
                const safeQuery = escapeRegex(query);
                const regexFilter = { username: { $regex: safeQuery, $options: 'i' }, ...filter };
                users = await User.find(regexFilter)
                    .sort(sort)
                    .skip((pageNum - 1) * limitNum)
                    .limit(limitNum);
                totalUsers = await User.countDocuments(regexFilter);
            }
        } else {
            // No search query, use normal query logic
            users = await User.find(filter)
                .sort(sort)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum);
            totalUsers = await User.countDocuments(filter);
        }
     
        const totalPages = Math.ceil(totalUsers / limitNum);
        const summaryUsers = toUserSummary(users);
        return res.status(200).json({
            users: summaryUsers.length > 0? summaryUsers : [],
            totalPages,
            totalUsers,
            currentPage: pageNum,
            limit: limitNum
        });
    } catch (error) {
        return res.status(500).json({ error: "Failed to query users" });
    }
};


export const queryTracks = async (req, res) => {
    try {
        const { orderBy, page = 1, limit = 10, keySig, "vocal-range": vocalRange, artistId, qualityValidated, query } = req.query;
        let sort = {};
        let filter = {};
        // Validate and sanitize pagination
        let pageNum = parseInt(page, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        let limitNum = parseInt(limit, 10);
        if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
        if (limitNum > 50) limitNum = 50;        if (orderBy == "popularity") sort = { purchaseCount: -1 };
        if (orderBy == "date-uploaded") sort = { createdAt: -1 };
        if (orderBy == "date-uploaded/ascending") sort = { createdAt: 1 };
        if (orderBy == "rating") sort = { averageRating: -1 };
        if (orderBy == "price") sort = { customerPrice: 1 };
        if (keySig) {
            try {
                const { key, isFlat, isSharp } = parseKeySignature(keySig); //function to parse key signature BB = Bflat e.t.c
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
        if (qualityValidated) {
            if (qualityValidated !== 'true' && qualityValidated !== 'false') {
                return res.status(400).json({ error: "Invalid quality validation filter" });
            }
            filter.qualityValidated = qualityValidated === 'true' ? 'yes' : 'no';
        }
        // Validate artistId if present
        if (artistId) {
            if (!mongoose.Types.ObjectId.isValid(artistId)) {
                return res.status(400).json({ error: "Invalid artistId" });
            }
            filter.user = artistId;
        }
        filter.isPrivate = false; //show public tracks only

        let tracks;
        let totalTracks;
        // If a search query is present, do a text/regex search, then filter/sort
        if (query) {
            if (!isSafeRegexInput(query)) {
                return res.status(400).json({ message: "Invalid search query" });
            }
            // Try $text search first
            const textFilter = { $text: { $search: query }, ...filter };
            tracks = await BackingTrack.find(textFilter)
                .sort(Object.keys(sort).length ? { ...sort, score: { $meta: 'textScore' } } : { score: { $meta: 'textScore' } })
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .select({ score: { $meta: 'textScore' } })
                .populate('user', 'avatar username');
            totalTracks = await BackingTrack.countDocuments(textFilter);

           
            if (!tracks.length) {
                // Fallback to regex search
                const safeQuery = escapeRegex(query);
                const regexFilter = { title: { $regex: safeQuery, $options: 'i' }, ...filter };
                tracks = await BackingTrack.find(regexFilter)
                    .sort(sort)
                    .skip((pageNum - 1) * limitNum)
                    .limit(limitNum)
                    .populate('user', 'avatar username');
                totalTracks = await BackingTrack.countDocuments(regexFilter);
            }
        } else {
            // No search query, use normal query logic
            tracks = await BackingTrack.find(filter)
                .sort(sort)
                .skip((pageNum - 1) * limitNum)
                .limit(limitNum)
                .populate('user', 'avatar username');
            totalTracks = await BackingTrack.countDocuments(filter);
        }
         if (! totalTracks){

                totalTracks = 0;
            }
               const totalPages = Math.ceil(totalTracks / limitNum);
        const summaryTracks = toTrackSummary(tracks);
        console.log('[queryTracks] totalTracks:', totalTracks, 'totalPages:', totalPages, 'tracks.length:', tracks.length);
        return res.status(200).json({
            tracks: summaryTracks.length > 0 ? summaryTracks : [],
            totalPages,
            totalTracks,
            currentPage: pageNum,
            limit: limitNum
        });
    } catch (error) {
        return res.status(500).json({ error: "Failed to query tracks" });
    }
};

/**
 * Search for tracks by title or other criteria with text search and regex fallback
 * @param {Express.Request & PublicRequest & {query: SearchQuery}} req - Express request with search parameters
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with track summaries
 */
/**
 * Search for tracks by title or other criteria with text search and regex fallback
 * @param {Express.Request & PublicRequest & {query: SearchQuery}} req - Express request with search parameters
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with track summaries
 */
export const searchTracks = async (req, res) => {
    try {
        const { query, page = 1 } = req.query;

        // 1. Check for query existence first
        if (!query) {
            return res.status(400).json({ message: "search query is required" });
        }
        // 2. Validate query for regex safety
        if (!isSafeRegexInput(query)) {
            return res.status(400).json({ message: "Invalid search query" });
        }
        // 3. Validate and sanitize pagination
        let pageNum = parseInt(page, 10);
        if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
        const limit = 10;
        const skip = (pageNum - 1) * limit;

        // 4. Use raw query for $text search
        let tracks = await BackingTrack.find({ $text: { $search: query }, isPrivate: false })
            .sort({ score: { $meta: 'textScore' } })
            .skip(skip)
            .limit(limit)
            .select({ score: { $meta: 'textScore' } })
            .populate('user', 'avatar username');
        if (!tracks.length) {
            // 5. Use escaped query for $regex fallback
            const safeQuery = escapeRegex(query);
            tracks = await BackingTrack.find({
                title: { $regex: safeQuery, $options: 'i' },
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

/**
 * Find and get a track by ID, including viewer-specific data like purchase status
 * @param {Express.Request & PublicRequest} req - Express request with track ID in params
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with track details
 */
/**
 * Find and get a track by ID, including viewer-specific data like purchase status
 * @param {Express.Request & PublicRequest & {params: {id: string}}} req - Express request with track ID in params
 * @param {Express.Response} res - Express response
 * @returns {Promise<PublicAPIResponse>} Promise resolving to API response with track details
 */
//find and get a track by id
export const getTrack = async (req, res) => {
    try {
        const user = req.userId ? await User.findById(req.userId) : null;

        if (!req.params.id) {
            return res.status(400).json({ message: 'Please insert a trackId' });
        }
        // Validate ObjectId BEFORE querying
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid track ID' });
        }        const track = await BackingTrack.findById(req.params.id).populate('user', 'avatar username');
        if (!track) {
            return res.status(404).json({ message: 'Track not found' });
        }
        return res.status(200).json(track.toJSON({
            viewerRole: req.user?.role || 'public',
            viewerId: req.userId || null,
            purchasedTrackIds: user?.purchasedTracks || []
        }));
    } catch (error) {
        console.error('Error in getTrack:', error); // Log the actual error for debugging
        return res.status(500).json({ message: 'Internal server error' });
    }
};