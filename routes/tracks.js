import express from 'express';
import { listS3 } from '../controllers/tracksController.js';

const router = express.Router();

router.get('/listS3', listS3);

export default router;