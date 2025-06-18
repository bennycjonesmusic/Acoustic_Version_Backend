import express from 'express';
import { verifyEmail, resendEmail } from '../controllers/emailAuthController.js';
import upload from '../middleware/song_upload.js';
import authMiddleware from '../middleware/customer_auth.js';
import publicMiddleware from '../middleware/public_auth.js' //limit amount of times someone can upload
import {searchUserByName
    




  
} from '../controllers/publicController.js';
import { addArtistReview, getArtistReviews, sortUploadedOrPurchasedTracks, followArtist, unfollowArtist, deleteArtistReview, getUploadedTracksByUser } from '../controllers/artistController.js';
import { uploadArtistExample, getArtistExamples, deleteArtistExample } from '../controllers/artistExamplesController.js';
import avatarUpload from '../middleware/avatar_upload.js';
import avatarModeration from '../middleware/avatar_moderation.js';
import { updateProfile } from '../controllers/authController.js';
import User from '../models/User.js';
import { getUploadedTracksByUserId } from '../controllers/tracksController.js';


const router = express.Router();

router.get("/search-by-username", authMiddleware, searchUserByName);

// Add a review to an artist
router.post('/review/:id', authMiddleware, addArtistReview);
// Get all reviews for an artist
router.get('/reviews/:id', authMiddleware, getArtistReviews);
// Follow an artist
router.post('/follow/:id', authMiddleware, followArtist);

router.post('/unfollow/:id', authMiddleware, unfollowArtist);
// Delete your review for an artist
router.delete('/delete-review/:id', authMiddleware, deleteArtistReview);

// Sort uploaded and bought tracks for the logged-in user
router.get('/sort-tracks', authMiddleware, sortUploadedOrPurchasedTracks);

// Artist example uploads (max 3, 30s each) with proper error handling
router.post('/artist/examples/upload', authMiddleware, (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error('[MULTER ERROR]', err);
            // Handle specific multer errors
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
            }
            if (err.code === 'LIMIT_UNEXPECTED_FILE') {
                return res.status(400).json({ error: 'Unexpected file field.' });
            }
            if (err.message.includes('Only audio files are allowed')) {
                return res.status(400).json({ error: 'Only audio files are allowed.' });
            }
            if (err.message.includes('File larger than 100mb')) {
                return res.status(400).json({ error: 'File too large. Maximum size is 100MB.' });
            }
            if (err.message.includes('inappropriate language')) {
                return res.status(400).json({ error: 'File name contains inappropriate language.' });
            }
            // Generic multer error
            return res.status(400).json({ error: 'File upload failed', details: err.message });
        }
        // No multer error, proceed to the upload handler
        uploadArtistExample(req, res, next);
    });
});
router.get('/artist/:id/examples', getArtistExamples);
router.get('/artist/get-artist-examples', authMiddleware, getArtistExamples);
router.delete('/artist/examples/:exampleId', authMiddleware, deleteArtistExample);

// Update artist/admin profile (with avatar upload to S3)
router.patch('/profile', authMiddleware, avatarUpload.single('avatar'), avatarModeration, updateProfile);

// Add GET /users/me route
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId); // Removed .lean() to allow .toJSON transform
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.status(200).json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get scheduled payouts for the current user (artist)
router.get('/scheduled-payouts', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('moneyOwed displayName email');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Calculate total pending
    const totalPending = user.moneyOwed.reduce((sum, owed) => sum + owed.amount, 0);

    // Format the response for frontend
    const scheduledPayouts = {
      totalPending: totalPending,
      currency: 'GBP',
      count: user.moneyOwed.length,
      payouts: user.moneyOwed.map(owed => ({
        id: owed._id,
        amount: owed.amount,
        reference: owed.reference,
        source: owed.source,
        createdAt: owed.createdAt,
        metadata: {
          trackIds: owed.metadata?.trackIds || [],
          purchaseType: owed.metadata?.purchaseType || 'unknown',
          customerEmail: owed.metadata?.customerEmail || 'unknown'
        }
      })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) // Newest first
    };

    res.status(200).json(scheduledPayouts);
  } catch (error) {
    console.error('Error fetching scheduled payouts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Admin route: Get scheduled payouts for all artists
router.get('/admin/all-scheduled-payouts', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const usersWithPayouts = await User.find({ 
      'moneyOwed.0': { $exists: true } 
    }).select('displayName email moneyOwed');

    const allScheduledPayouts = usersWithPayouts.map(artist => {
      const totalPending = artist.moneyOwed.reduce((sum, owed) => sum + owed.amount, 0);
      
      return {
        artistId: artist._id,
        artistName: artist.displayName || artist.email,
        artistEmail: artist.email,
        totalPending: totalPending,
        count: artist.moneyOwed.length,
        payouts: artist.moneyOwed.map(owed => ({
          id: owed._id,
          amount: owed.amount,
          reference: owed.reference,
          source: owed.source,
          createdAt: owed.createdAt,
          metadata: owed.metadata
        })).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      };
    }).sort((a, b) => b.totalPending - a.totalPending); // Highest pending first

    const summary = {
      totalArtists: allScheduledPayouts.length,
      totalPendingAmount: allScheduledPayouts.reduce((sum, artist) => sum + artist.totalPending, 0),
      totalPendingPayouts: allScheduledPayouts.reduce((sum, artist) => sum + artist.count, 0)
    };

    res.status(200).json({
      summary,
      artists: allScheduledPayouts
    });
  } catch (error) {
    console.error('Error fetching all scheduled payouts:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all tracks uploaded by a specific user (artist)
router.get('/users/:id/tracks', authMiddleware, getUploadedTracksByUser);
router.get('/artist/:id/tracks', getUploadedTracksByUserId);

// Recalculate average commission completion time for the current user (artist only)
router.post('/recalculate-commission-time', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role !== 'artist') {
      return res.status(403).json({ message: 'Only artists can recalculate commission completion time' });
    }

    const averageTime = await user.calculateAverageCommissionCompletionTime();

    res.status(200).json({
      message: 'Average commission completion time recalculated successfully',
      averageCommissionCompletionTime: averageTime,
      numOfCommissions: user.numOfCommissions
    });
  } catch (error) {
    console.error('Error recalculating commission completion time:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Remove the registration route from users.js (handled in auth.js)

export default router;

