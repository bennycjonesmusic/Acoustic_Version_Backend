import express from 'express';

import upload from '../middleware/song_upload.js';
import authMiddleware from '../middleware/customer_auth.js';
import artistAuthMiddleware from '../middleware/artist_auth.js';
import { uploadLimiter, registerLimiter, downloadLimiter } from '../middleware/rate_limiter.js' //limit amount of times someone can upload

import {
  listS3,
  downloadTrack,
  getUploadedTracks,
  deleteTrack,
  uploadTrack,
  getPurchasedTracks,
  rateTrack,
  commentTrack,
  deleteComment, // import deleteComment
  editTrack, // import editTrack
  
} from '../controllers/tracksController.js';

const router = express.Router();

router.get('/tracks/list-s3', listS3);

//now we handle the upload of backing tracks. Create, Read, Update and Delete Operations. For now though, create and delete will suffice.

router.post('/tracks/upload', (req, res, next) => {
  console.log('=== TRACKS ROUTE HIT ===');
  console.log('File uploaded:', !!req.file);
  console.log('User ID:', req.userId);
  next();
}, uploadLimiter, authMiddleware, upload.single('file'), uploadTrack);

router.put('/tracks/edit/:id', uploadLimiter, authMiddleware, editTrack); // edit a track by id (with rate limiting)

router.delete('/tracks/:id', authMiddleware, deleteTrack); //delete a track by id

//get tracks from the user. This will be used to display the tracks on the front end.
router.get('/tracks/uploaded-tracks',  authMiddleware, getUploadedTracks);

router.get('/tracks/purchased-tracks',authMiddleware, getPurchasedTracks)

router.post('/tracks/rate/:id', authMiddleware, rateTrack); //rate a track by id
router.post('/tracks/comment/:id', authMiddleware, commentTrack); //comment on a track by id
router.delete('/tracks/comment/:commentId', authMiddleware, deleteComment); //delete a comment by commentId

// Debug: log all download requests before any middleware
router.get('/tracks/download/:id', (req, res, next) => {
  console.log('[ROUTER DEBUG] /tracks/download/:id hit for', req.params.id);
  next();
}, downloadLimiter, authMiddleware, downloadTrack); //req.params.id = :id needed in route

router.delete('/tracks/delete/:id', authMiddleware, deleteTrack)
export default router;