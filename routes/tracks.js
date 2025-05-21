import express from 'express';

import upload from '../middleware/song_upload.js';
import authMiddleware from '../middleware/customer_auth.js';
import artistAuthMiddleware from '../middleware/artist_auth.js';
import { uploadLimiter, registerLimiter, downloadLimiter } from '../middleware/rate_limiter.js' //limit amount of times someone can upload

import {
  listS3,
  queryTracks,
  searchTracks,
  downloadTrack,
  getUploadedTracks,
  deleteTrack,
  uploadTrack,
  getTrack,
  getBoughtTracks
  
} from '../controllers/tracksController.js';

const router = express.Router();

router.get('/tracks/list-s3', listS3);

router.get('/tracks/query', queryTracks); //needs no auth middleware as it is public route.

router.get('/tracks/search', searchTracks); 

//now we handle the upload of backing tracks. Create, Read, Update and Delete Operations. For now though, create and delete will suffice.

router.post('/tracks/upload', uploadLimiter, authMiddleware, upload.single('file'), uploadTrack);

router.delete('/tracks/:id', authMiddleware, deleteTrack); //delete a track by id

//get tracks from the user. This will be used to display the tracks on the front end.
router.get('/uploaded-tracks',  authMiddleware, getUploadedTracks);

router.get('/bought-tracks',authMiddleware, getBoughtTracks)

//get one singular track
router.get('/tracks/:id', authMiddleware, getTrack);

router.get('/tracks/download/:id', downloadLimiter, authMiddleware, downloadTrack); //req.params.id = :id needed in route

router.delete('/tracks/delete/:id', authMiddleware, deleteTrack)
export default router;