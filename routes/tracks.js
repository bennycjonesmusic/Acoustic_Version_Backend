import express from 'express';

import upload from '../middleware/song_upload.js';
import authMiddleware from '../middleware/customer_auth.js';
import artistAuthMiddleware from '../middleware/artist_auth.js';
import {uploadLimiter, registerLimiter} from '../middleware/rate_limiter.js' 

import { listS3, queryTracks, searchTracks, downloadTrack, getTracks, deleteTrack, uploadTrack} from '../controllers/tracksController.js';

const router = express.Router();

router.get('/listS3', listS3);

router.get('/queryTracks', queryTracks); //needs no auth middleware as it is public route.

router.get('/searchTracks', searchTracks); //no need for camelcase here. search-tracks = standard practice. change it.
export default router;

//now we handle the upload of backing tracks. Create, Read, Update and Delete Operations. For now though, create and delete will suffice.

router.post('/upload', authMiddleware, uploadLimiter, upload.single('file'), uploadTrack)

router.delete('/delete/:id', authMiddleware, deleteTrack)

//get tracks from the user. This will be used to display the tracks on the front end.
router.get('/tracks', authMiddleware, getTracks)

router.get('/downloadTrack/:id', authMiddleware, downloadTrack) //req.params.id = :id needed in route