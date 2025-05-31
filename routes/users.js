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

// Artist example uploads (max 3, 30s each)
router.post('/artist/examples/upload', authMiddleware, upload.single('file'), uploadArtistExample);
router.get('/artist/:id/examples', getArtistExamples);
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

// Get all tracks uploaded by a specific user (artist)
router.get('/users/:id/tracks', authMiddleware, getUploadedTracksByUser);
router.get('/:id/tracks', getUploadedTracksByUserId);

// Registration route with avatar upload and moderation
router.post('/register', avatarUpload.single('avatar'), avatarModeration, register);

// Remove the GET /users/:id route for user details (was added for test, now redundant)

export default router;

