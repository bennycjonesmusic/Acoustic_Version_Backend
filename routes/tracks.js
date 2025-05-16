import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';  // AWS SDK v3 for S3
import { Upload } from '@aws-sdk/lib-storage';
//import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import express from 'express';

const router = express.Router(); //create a new router Object. 



//list all the songs in the S3 bucket. This will be used to display the songs in the admin panel.
const s3 = new S3Client({



    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const bucketName = process.env.AWS_BUCKET_NAME; //set the BUCKET.

router.get('/listS3', async (req, res) => {

try {
const command = new ListObjectsV2Command({

BUCKET: bucketName
//no prefix for now. Can add later if needed.

});

const data = await s3.send(command); 

  const tracks = (data.Contents || []).map(item => ({
      key: item.Key,
      lastModified: item.LastModified,
      size: item.Size
    }));

    res.json(tracks);
} catch (error) {


    console.error('Error listing backing tracks:', err);
    res.status(500).json({ error: 'Failed to list backing tracks' });
  



}



});



export default router; //export router for use. make sure to import and use in server.js!