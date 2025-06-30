import { S3Client, ListObjectsCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import { createArtistApprovedNotification, createArtistRejectedNotification } from '../utils/notificationHelpers.js';
import { Parser } from 'json2csv';
import path from 'path';
import fs from 'fs';

export const clearS3 = async (req, res) => {
    try {
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const listParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
        };
        const data = await s3Client.send(new ListObjectsCommand(listParams));
        if (data.Contents && data.Contents.length > 0) {
            console.log("Deleting files from S3 bucket:", data.Contents);
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Delete: {
                    Objects: data.Contents.map((object) => ({ Key: object.Key })),
                },
            };
            await s3Client.send(new DeleteObjectsCommand(deleteParams));
            return res.status(200).json({ message: 'All files deleted from S3' });
        } else {
           return res.status(200).json({ message: 'No files to delete from S3' });
        }
    } catch (error) {
        console.error('Error clearing S3 bucket:', error);
       return res.status(500).json({ message: 'Error clearing S3', error: error.message });
    }
};

export const deleteAllUsers = async (req, res) => {
    // Require a special admin code for extra safety
    const adminCode = req.header('x-admin-code');
    if (!adminCode || adminCode !== process.env.ADMIN_DELETE_CODE) {
        return res.status(403).json({ message: 'Admin code required or incorrect.' });
    }
    try {
        // Delete all users
        const userResult = await User.deleteMany({});
        // Delete all tracks
        const trackResult = await BackingTrack.deleteMany({});
        // Clear S3
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const listParams = { Bucket: process.env.AWS_BUCKET_NAME };
        const data = await s3Client.send(new ListObjectsCommand(listParams));
        let s3Message = 'No files to delete from S3';
        if (data.Contents && data.Contents.length > 0) {
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Delete: {
                    Objects: data.Contents.map((object) => ({ Key: object.Key })),
                },
            };
            await s3Client.send(new DeleteObjectsCommand(deleteParams));
            s3Message = 'All files deleted from S3';
        }
        return res.status(200).json({ 
            message: `${userResult.deletedCount} users and ${trackResult.deletedCount} tracks deleted. ${s3Message}` 
        });
    } catch (error) {
        console.error('Error deleting all users/tracks and clearing S3:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password -__v').populate('uploadedTracks', 'title fileUrl');
       return res.status(200).json(users);
    } catch (error) {
        console.error('Problem fetching users:', error);
       return res.status(500).json({ message: "Error getting users" });
    }
};

// Admin: Ban a user
export const banUser = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.banned = true;
    await user.save();
    return res.status(200).json({ success: true, message: 'User banned.' });
  } catch (error) {
    console.error('Error banning user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin: Get all sales and refund history
export const getAllSalesAndRefunds = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    // Get all users with their purchasedTracks
    const users = await User.find({}, 'username email purchasedTracks').populate({
      path: 'purchasedTracks.track',
      select: 'title user',
      populate: { path: 'user', select: 'username' }
    });
    // Flatten all purchases
    const allPurchases = [];
    users.forEach(user => {
      user.purchasedTracks.forEach(p => {        allPurchases.push({
          buyer: user.username,
          buyerEmail: user.email,
          trackTitle: p.track?.title,
          artist: p.track?.user?.username,
          trackId: p.track?._id || p.track?.id,
          paymentIntentId: p.paymentIntentId,
          purchasedAt: p.purchasedAt,
          price: p.price,
          refunded: p.refunded
        });
      });
    });
    return res.status(200).json({ sales: allPurchases });
  } catch (error) {
    console.error('Error fetching sales/refunds:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin: Get total income per month and export sales/refunds to CSV as file
export const getSalesStatsAndCsv = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    // Get all users with their purchasedTracks
    const users = await User.find({}, 'username email purchasedTracks').populate({
      path: 'purchasedTracks.track',
      select: 'title user',
      populate: { path: 'user', select: 'username' }
    });
    // Flatten all purchases
    const allPurchases = [];
    users.forEach(user => {
      user.purchasedTracks.forEach(p => {        allPurchases.push({
          buyer: user.username,
          buyerEmail: user.email,
          trackTitle: p.track?.title,
          originalArtist: p.track?.originalArtist, // Add originalArtist
          artist: p.track?.user?.username,
          trackId: p.track?._id || p.track?.id,
          paymentIntentId: p.paymentIntentId,
          purchasedAt: p.purchasedAt,
          price: p.price,
          refunded: p.refunded
        });
      });
    });
    // Calculate total income per month (exclude refunded)
    const incomeByMonth = {};
    allPurchases.forEach(p => {
      if (!p.refunded && p.price && p.purchasedAt) {
        const date = new Date(p.purchasedAt);
        const month = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
        incomeByMonth[month] = (incomeByMonth[month] || 0) + p.price;
      }
    });
    // CSV export to file
    const parser = new Parser();
    const csv = parser.parse(allPurchases);
    const fileName = `sales-history-${Date.now()}.csv`;
    const filePath = path.join(require('os').homedir(), 'Downloads', fileName);
    fs.writeFileSync(filePath, csv);
    return res.status(200).json({
      incomeByMonth,
      csvFile: filePath
    });
  } catch (error) {
    console.error('Error fetching sales stats/csv:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Admin: List all pending (and optionally rejected) artists
export const getPendingArtists = async (req, res) => {
    try {
        const pendingArtists = await User.find({
            role: 'artist',
            profileStatus: { $in: ['pending', 'rejected'] }
        }).select('-password');
        return res.status(200).json({ artists: pendingArtists });
    } catch (err) {
        return res.status(500).json({ message: 'Failed to fetch pending artists', error: err.message });
    }
};

// Admin: Approve an artist profile
export const approveArtist = async (req, res) => {
    try {
        const artist = await User.findById(req.params.id);
        if (!artist || artist.role !== 'artist') {
            return res.status(404).json({ message: 'Artist not found' });
        }
        artist.profileStatus = 'approved';
        await artist.save();
          // Create approval notification for the artist
        try {
            // Defensive coding: handle both _id and id fields
            const artistId = artist._id || artist.id;
            if (artistId) {
                await createArtistApprovedNotification(artistId);
                console.log(`Artist approval notification sent to: ${artist.username}`);
            } else {
                console.error('Could not create approval notification: missing artist ID');
            }
        } catch (notifError) {
            console.error('Error creating artist approval notification:', notifError);
            // Don't fail the approval if notification creation fails
        }
        
        return res.status(200).json({ message: 'Artist approved', artist });
    } catch (err) {
        return res.status(500).json({ message: 'Failed to approve artist', error: err.message });
    }
};

// Admin: Reject an artist profile
export const rejectArtist = async (req, res) => {
    try {
        const artist = await User.findById(req.params.id);
        if (!artist || artist.role !== 'artist') {
            return res.status(404).json({ message: 'Artist not found' });
        }
        artist.profileStatus = 'rejected';
        await artist.save();
          // Create rejection notification for the artist
        try {
            // Defensive coding: handle both _id and id fields
            const artistId = artist._id || artist.id;
            if (artistId) {
                await createArtistRejectedNotification(artistId);
                console.log(`Artist rejection notification sent to: ${artist.username}`);
            } else {
                console.error('Could not create rejection notification: missing artist ID');
            }
        } catch (notifError) {
            console.error('Error creating artist rejection notification:', notifError);
            // Don't fail the rejection if notification creation fails
        }
        
        return res.status(200).json({ message: 'Artist rejected', artist });
    } catch (err) {
        return res.status(500).json({ message: 'Failed to reject artist', error: err.message });
    }
};

// TEST-ONLY: Delete a user by email (for test automation)
// This function ONLY deletes the user document. It does NOT delete or modify any tracks, even if the user is an artist/uploader.
// This ensures that deleting a customer never affects tracks uploaded by other users (artists/admins).
export const deleteUserByEmail = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email required' });
  try {    // Only delete the user document. Do NOT delete or modify any tracks.
    const user = await User.findOneAndDelete({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    // Defensive coding: handle both _id and id fields
    const userId = user._id || user.id;
    return res.status(200).json({ message: 'User deleted', userId });
  } catch (err) {
    return res.status(500).json({ message: 'Error deleting user', error: err.message });
  }
};

export const getAllArtistsForApporval = async (req, res) => {
  try {
    // Parse pagination params
    const { page = 1, limit = 10 } = req.query;
    let pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    let limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
    if (limitNum > 50) limitNum = 50;
    const skip = (pageNum - 1) * limitNum;

    // Query for pending artists with pagination
    const filter = { role: 'artist', profileStatus: 'pending' };
    const totalArtists = await User.countDocuments(filter);
    const artists = await User.find(filter)
      .select('name description artistExamples')
      .skip(skip)
      .limit(limitNum);

    if (!artists || artists.length === 0) {
      return res.status(404).json({ message: 'No artists pending approval' });
    }

    // Only return the required fields, using artistExamples
    const result = artists.map(artist => ({
      name: artist.name,
      description: artist.description,
      examples: artist.artistExamples?.map(example => ({
        url: example.url,
        description: example.description,
        uploadedAt: example.uploadedAt
      })) || []
    }));

    const totalPages = Math.ceil(totalArtists / limitNum);
    return res.status(200).json({
      artists: result,
      totalPages,
      totalArtists,
      currentPage: pageNum,
      limit: limitNum
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch artists for approval', error: err.message });
  }
}

// Admin: Get contact us forms, paginated and grouped by type
export const getContactForms = async (req, res) => {
  try {
    // Parse pagination and sorting params
    const { page = 1, limit = 10, sort = 'createdAt', order = 'desc', type } = req.query;
    let pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    let limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1) limitNum = 10;
    if (limitNum > 50) limitNum = 50;
    const skip = (pageNum - 1) * limitNum;
    let sortOption = {};
    sortOption[sort] = order === 'asc' ? 1 : -1;

    // Build filter
    const filter = {};
    if (type) filter.type = type;

    // Get total count for pagination
    const totalForms = await contactForm.countDocuments(filter);
    // Query forms
    const forms = await contactForm.find(filter)
      .sort(sortOption)
      .skip(skip)
      .limit(limitNum)
      .populate('reporter', 'username email');

    // Group by type (category)
    const grouped = {};
    forms.forEach(form => {
      if (!grouped[form.type]) grouped[form.type] = [];
      grouped[form.type].push(form);
    });

    const totalPages = Math.ceil(totalForms / limitNum);
    return res.status(200).json({
      forms: grouped,
      totalPages,
      totalForms,
      currentPage: pageNum,
      limit: limitNum
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch contact forms', error: err.message });
  }
}

// Utility: Get a mailto link for replying to a contact form
export const replyToForm = (form) => {
  if (!form || !form.email) return null;
  // Optionally, you can prefill subject/body here
  const subject = encodeURIComponent('Reply to your contact form query on Acoustic-version');
  const body = encodeURIComponent('Hi,\n\nThank you for contacting us.\n\n');
  return `mailto:${form.email}?subject=${subject}&body=${body}`;
};

// Admin: Get website analytics (basic)
export const getWebsiteAnalytics = async (req, res) => {
  try {
    // Only allow admin
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin privileges required.' });
    }
    // Aggregate analytics from all users
    const users = await User.find({}, 'analytics');
    let totalHits = 0;
    let uniqueHits = 0;
    let conversions = 0;
    users.forEach(user => {
      if (user.analytics) {
        totalHits += user.analytics.totalHits || 0;
        uniqueHits += user.analytics.uniqueHits || 0;
        conversions += user.analytics.conversions || 0;
      }
    });
    return res.status(200).json({
      totalHits,
      uniqueHits,
      conversions
    });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to fetch analytics', error: err.message });
  }
};