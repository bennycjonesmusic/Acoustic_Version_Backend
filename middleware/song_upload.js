import multer from 'multer'; // Import multer to handle file uploads
import multerS3 from 'multer-s3'; //Import multer-s3 to specifically deal with AWS S3
import AWS from 'aws-sdk'; // NPM package to interact with AWS services
import dotenv from 'dotenv'; // Interact with environment variable for api keys.


//set up S3 instance
//provide AWS credentials and region
const S3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION,
});

const upload = multer({    
    storage: multerS3({

        s3: S3,
        bucket: process.env.AWS_BUCKET_NAME,
        acl: 'private', // Set the access control list to private. Selling backing tracks.
        contentType: multerS3.AUTO_CONTENT_TYPE, //auto detect content type (for now)
        key: function (req, file, cb) {
            cb(null, `songs/${Date.now().toString()}-${file.originalname}`); // Set the file name in S3
        },


    })


});


export default upload; // export the upload middleware.