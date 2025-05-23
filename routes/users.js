import express from 'express';
import { verifyEmail, resendEmail } from '../controllers/emailAuthController.js';
import upload from '../middleware/song_upload.js';
import authMiddleware from '../middleware/customer_auth.js';
import artistAuthMiddleware from '../middleware/artist_auth.js';
import publicMiddleware from '../middleware/public_auth.js' //limit amount of times someone can upload
import {searchUserByName
    




  
} from '../controllers/publicController.js';
import { addArtistReview, getArtistReviews } from '../controllers/artistController.js';


const router = express.Router();

router.get("/search-by-username", publicMiddleware, searchUserByName);

// Add a review to an artist
router.post('/artist/:id/review', authMiddleware, addArtistReview);
// Get all reviews for an artist
router.get('/artist/:id/reviews', publicMiddleware, getArtistReviews);

export default router;

