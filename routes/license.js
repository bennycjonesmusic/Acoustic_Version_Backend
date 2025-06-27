import express from 'express';
import multer from 'multer';
import { uploadLicenseDocument, deleteLicenseDocument } from '../controllers/license.js';
import { isSafeRegexInput } from '../utils/regexSanitizer.js';
import authMiddleware from '../middleware/customer_auth.js';

const router = express.Router();

// Only allow PDF and image files for license uploads
const allowedMimeTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
const fileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and image files (PNG, JPG, JPEG) are allowed for license documents.'));
  }
};

// Use multer for file uploads (memory storage) with file type filter
const upload = multer({ storage: multer.memoryStorage(), fileFilter });

// Upload license document (POST)
router.post('/', authMiddleware, upload.single('licenseDocument'), (req, res, next) => {
  // Check filename with regex tester
  if (req.file && !isSafeRegexInput(req.file.originalname)) {
    return res.status(400).json({ message: 'Invalid or unsafe file name.' });
  }
  next();
}, uploadLicenseDocument);

// Delete license document (DELETE)
router.delete('/', authMiddleware, deleteLicenseDocument);

export default router;
