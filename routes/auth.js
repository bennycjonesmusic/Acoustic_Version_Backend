import express from 'express';
import upload from '../middleware/song_upload.js';
import authMiddleware from '../middleware/customer_auth.js';
import artistAuthMiddleware from '../middleware/artist_auth.js';
import {
    register,
    login,
    uploadTrack,
    deleteTrack,
    getTracks,
    updateS3Key
} from '../controllers/authController.js';

//define the router. This will handle the routes and be used to handle requests from the frontend.
const router = express.Router();

//deal with registration first. This will handle user registrations. Post ensures that the data is sent in the body of the request.
router.post('/register', register)

//now let us deal with login. We will use post again, in order to send the data to the client.
router.post('/login', login)

//now we handle the upload of backing tracks. Create, Read, Update and Delete Operations. For now though, create and delete will suffice.

router.post('/upload', authMiddleware, upload.single('file'), uploadTrack)

router.delete('/delete/:id', authMiddleware, deleteTrack)

//get tracks from the user. This will be used to display the tracks on the front end.
router.get('/tracks', authMiddleware, getTracks)

//update S3 File for ID's that were not initially added.
router.put('/updateS3/:id', authMiddleware, updateS3Key)

export default router;

