import express from 'express';
import { trackSiteVisit, updateOnlyUnique, trackBackingTrackHit, getUserTotalHits } from '../controllers/site_analytics.js';
import authMiddleware from '../middleware/customer_auth.js';

const router = express.Router();

// Route to track site visits (total hits and unique visitors)
router.post('/visit', trackSiteVisit);
// Route to update only unique visitors (and total hits)
router.post('/unique', updateOnlyUnique);
// Route to track totalHits for a backing track
router.post('/track/:trackId/hit', trackBackingTrackHit);
// Route to get totalHits for all tracks uploaded by a user
router.get('/user/total-hits', authMiddleware, getUserTotalHits);

export default router;
