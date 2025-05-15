import { S3Client, ListObjectsCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Router } from 'express';
import authMiddleware from '../middleware/customer_auth.js'
import dotenv from 'dotenv';

//import necessary modules

const router = Router(); 

router.delete('/clear-s3', authMiddleware, async (req, res) => {

try {


    const s3Client = new S3Client({ //create an S3 client. Connect to AWS S3.
        region: process.env.AWS_REGION,
        credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
    });

    const listParams = {
        Bucket: process.env.AWS_BUCKET_NAME,
    };

    const data = await s3Client.send(new ListObjectsCommand(listParams)); //list all objects in the bucket.

    if (data.Contents && data.Contents.length > 0) { //condition to check if array length is greater than 0. If > 0 then goodbye.
        console.log("Deleting files from S3 bucket:", data.Contents);
        const deleteParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Delete: {
                Objects: data.Contents.map((object) => ({ Key: object.Key })),
            },
        };

        await s3Client.send(new DeleteObjectsCommand(deleteParams)); //send delete command to S3.
        res.status(200).json({ message: 'All files deleted from S3' });
    } else {
        res.status(200).json({ message: 'No files to delete from S3' });
    }
} catch (error) {
    console.error('Error clearing S3 bucket:', error);
    res.status(500).json({ message: 'Error clearing S3', error: error.message });
}





});


export default router;