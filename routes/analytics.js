import express from 'express';
import { trackSiteVisit, updateOnlyUnique, trackBackingTrackHit, getUserTotalHits, getTrackViewStats, getAllPageHits, getWeeklyWebsiteHits, getUserTrackWeeklyHits, getDailyHitsLast30, getMostVisitedTrack, getLeastVisitedTrack } from '../controllers/site_analytics.js';
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
// Route to get most viewed, least viewed, and total overall track hits
router.get('/track/view-stats', getTrackViewStats);
// Route to get all pageHits (page URLs and their hit counts)
router.get('/page-hits', getAllPageHits);
// Route to get total website views per week
router.get('/weekly-hits', getWeeklyWebsiteHits);
// Route to get total track views per week for a user (artist)
router.get('/user/track-weekly-hits', authMiddleware, getUserTrackWeeklyHits);
// Route to get last 30 days daily site hits
router.get('/daily-hits-last30', getDailyHitsLast30);
// Route to get most visited track
router.get('/track/most-visited', getMostVisitedTrack);
// Route to get least visited track
router.get('/track/least-visited', getLeastVisitedTrack);

export default router;
