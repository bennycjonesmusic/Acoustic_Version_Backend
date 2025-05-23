import express from 'express';
import { verifyEmail, resendEmail } from '../controllers/emailAuthController.js';
import upload from '../middleware/song_upload.js';
import authMiddleware from '../middleware/customer_auth.js';
import artistAuthMiddleware from '../middleware/artist_auth.js';
import publicMiddleware from '../middleware/public_auth.js' //limit amount of times someone can upload
import {searchUserByName
    




  
} from '../controllers/publicController.js';
import { addArtistReview, getArtistReviews } from '../controllers/artistController.js';
import { uploadArtistExample, getArtistExamples, deleteArtistExample } from '../controllers/artistExamplesController.js';


const router = express.Router();

router.get("/search-by-username", publicMiddleware, searchUserByName);

// Add a review to an artist
router.post('/artist/:id/review', authMiddleware, addArtistReview);
// Get all reviews for an artist
router.get('/artist/:id/reviews', publicMiddleware, getArtistReviews);

// Artist example uploads (max 3, 30s each)
router.post('/artist/examples/upload', artistAuthMiddleware, upload.single('file'), uploadArtistExample);
router.get('/artist/:id/examples', getArtistExamples);
router.delete('/artist/examples/:exampleId', artistAuthMiddleware, deleteArtistExample);

export default router;

