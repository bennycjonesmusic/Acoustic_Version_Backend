import express from 'express';
import { 
  createContactFormEntry, 
  getContactFormEntries, 
  getContactFormEntry,
  updateContactFormEntry,
  deleteContactFormEntry,
  getContactFormStats,
  clearReviewedContactFormEntries
} from '../controllers/forumReportController.js';
import authMiddleware from '../middleware/customer_auth.js';
import publicAuth from '../middleware/public_auth.js';
import IsAdmin from '../middleware/Admin.js';

const router = express.Router();

// Public: allow anonymous and authenticated users to submit contact forms
router.post('/', publicAuth, createContactFormEntry);

// Admin: get contact form statistics
router.get('/stats', authMiddleware, IsAdmin, getContactFormStats);

// Admin: get all contact form entries (with pagination and filtering)
router.get('/', authMiddleware, IsAdmin, getContactFormEntries);

// Admin: clear all reviewed (resolved) contact form entries
router.delete('/clear-reviewed', authMiddleware, IsAdmin, clearReviewedContactFormEntries);

// Admin: get specific contact form entry by ID
router.get('/:id', authMiddleware, IsAdmin, getContactFormEntry);

// Admin: update contact form entry status
router.patch('/:id', authMiddleware, IsAdmin, updateContactFormEntry);

// Admin: delete contact form entry
router.delete('/:id', authMiddleware, IsAdmin, deleteContactFormEntry);

export default router;
