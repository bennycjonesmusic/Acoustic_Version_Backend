import { S3Client, ListObjectsCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
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
      user.purchasedTracks.forEach(p => {
        allPurchases.push({
          buyer: user.username,
          buyerEmail: user.email,
          trackTitle: p.track?.title,
          artist: p.track?.user?.username,
          trackId: p.track?._id,
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
      user.purchasedTracks.forEach(p => {
        allPurchases.push({
          buyer: user.username,
          buyerEmail: user.email,
          trackTitle: p.track?.title,
          originalArtist: p.track?.originalArtist, // Add originalArtist
          artist: p.track?.user?.username,
          trackId: p.track?._id,
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
  try {
    // Only delete the user document. Do NOT delete or modify any tracks.
    const user = await User.findOneAndDelete({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    return res.status(200).json({ message: 'User deleted', userId: user._id });
  } catch (err) {
    return res.status(500).json({ message: 'Error deleting user', error: err.message });
  }
};
