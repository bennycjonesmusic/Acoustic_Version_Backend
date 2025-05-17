import express from 'express';

import { listS3, queryTracks } from '../controllers/tracksController.js';

const router = express.Router();

router.get('/listS3', listS3);

router.get('/queryTracks', queryTracks); //needs no auth middleware as it is public route.
export default router;