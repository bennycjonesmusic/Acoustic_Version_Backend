import express from 'express';
import { createContactFormEntry, getContactFormEntries, updateContactFormEntry } from '../controllers/forumReportController.js';
import authMiddleware from '../middleware/customer_auth.js';
import publicAuth from '../middleware/public_auth.js';
import IsAdmin from '../middleware/Admin.js';

const router = express.Router();

// Public: allow anonymous and authenticated users to submit reports
router.post('/', publicAuth, createContactFormEntry);

// Admin: get all contact form entries
router.get('/', authMiddleware, IsAdmin, getContactFormEntries);

// Admin: update contact form entry status
router.patch('/:id', authMiddleware, IsAdmin, updateContactFormEntry);

export default router;
