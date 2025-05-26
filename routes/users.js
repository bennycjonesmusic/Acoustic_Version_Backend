import express from 'express';
import { verifyEmail, resendEmail } from '../controllers/emailAuthController.js';
import upload from '../middleware/song_upload.js';
import authMiddleware from '../middleware/customer_auth.js';
import publicMiddleware from '../middleware/public_auth.js' //limit amount of times someone can upload
import {searchUserByName
    




  
} from '../controllers/publicController.js';
import { addArtistReview, getArtistReviews, sortUploadedOrBoughtTracks, followArtist, deleteArtistReview } from '../controllers/artistController.js';
import { uploadArtistExample, getArtistExamples, deleteArtistExample } from '../controllers/artistExamplesController.js';
import avatarUpload from '../middleware/avatar_upload.js';
import { updateProfile } from '../controllers/authController.js';


const router = express.Router();

router.get("/search-by-username", authMiddleware, searchUserByName);

// Add a review to an artist
router.post('/artist/:id/review', authMiddleware, addArtistReview);
// Get all reviews for an artist
router.get('/artist/:id/reviews', authMiddleware, getArtistReviews);
// Follow an artist
router.post('/artist/:id/follow', authMiddleware, followArtist);
// Delete your review for an artist
router.delete('/artist/:id/review', authMiddleware, deleteArtistReview);

// Sort uploaded and bought tracks for the logged-in user
router.get('/sort-tracks', authMiddleware, sortUploadedOrBoughtTracks);

// Artist example uploads (max 3, 30s each)
router.post('/artist/examples/upload', authMiddleware, upload.single('file'), uploadArtistExample);
router.get('/artist/:id/examples', getArtistExamples);
router.delete('/artist/examples/:exampleId', authMiddleware, deleteArtistExample);

// Update artist/admin profile (with avatar upload to S3)
router.patch('/profile', authMiddleware, avatarUpload.single('avatar'), updateProfile);

export default router;

