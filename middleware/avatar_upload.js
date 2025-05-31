import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { sanitizeFileName } from '../utils/regexSanitizer.js';

const s3 = new S3Client({

    region: process.env.AWS_REGION,
    credentials: {

        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

const allowedTypes = /jpeg|jpg|png|gif/; // file types allowed

const upload = multer({

     storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET_NAME,
        // avatars should be public
        acl: 'public-read', // Restored ACL for public avatar access
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            const sanitizedName = sanitizeFileName(file.originalname);
            const uniqueName = `avatars/${req.userId || 'user'}_${Date.now()}_${sanitizedName}`;
            cb(null, uniqueName);

        }



     }),
     fileFilter: (req, file, cb) => {
    const ext = getFileExtension(file.originalname);
    if (allowedTypes.test(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'));
    }
     }

    });

  










  export default upload;