import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';

const s3 = new S3Client({

    region: process.env.AWS_REGION,
    credentials: {

        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

    const upload = multer({

     storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME,
        acl: 'public-read', //avatars should be public
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            const ext = file.originalname.split('.').pop();
             const uniqueName = `avatars/${req.userId || 'user'}_${Date.now()}.${ext}`;
             cb(null, uniqueName);

        }



     }),
     fileFilter: (req, file, cb) => {

    const allowedTypes = /jpeg|jpg|png|gif/; //file types allowed
    const ext = file.originalname.split('.').pop().toLowerCase(); 
    /* get the file extension. .split splits the string by '.' returning an array of two elements. Then pop returns the last element of the array
    thus getting the file extension. */
    if (allowedTypes.test(ext)) {

        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'));
    }




     }

    });

  










  export default upload;