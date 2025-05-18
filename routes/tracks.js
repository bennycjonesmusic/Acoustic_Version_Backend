import express from 'express';

import { listS3, queryTracks, searchTracks } from '../controllers/tracksController.js';

const router = express.Router();

router.get('/listS3', listS3);

router.get('/queryTracks', queryTracks); //needs no auth middleware as it is public route.

router.get('/searchTracks', searchTracks); //no need for camelcase here. search-tracks = standard practice. change it.
export default router;