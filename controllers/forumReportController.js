import contactForm from "../models/contact_form.js";
import User from "../models/User.js";
import CommissionRequest from "../models/CommissionRequest.js";
import { contactForumSchema } from "./validationSchemas.js";
import * as Filter from 'bad-words'; 

/**
 * @route POST /report
 * @description Submit a contact form entry (public endpoint)
 * @access Public (with optional authentication)
 * @body {string} email - User's email address
 * @body {string} description - Message description (min 10, max 1000 chars)
 * @body {string} type - Contact type: general, bug_report, feature_request, user_report, other, commission_dispute, copyright_complaint
 * @returns {Object} Success message and entry confirmation
 */
export const createContactFormEntry = async (req, res) => {
  try {
    const { email, description, type, commissionId } = req.body; // Destructure commissionId as optional
    const { error } = contactForumSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Use latest email logic: if email is missing and user is authenticated, use user's email
    let finalEmail = email;
    let reporter = null;
    let user = null;
    if (req.userId) {
      try {
        user = await User.findById(req.userId).select('_id email');
        const userIdVal = user ? (user._id || user.id) : null;
        if ((!finalEmail || finalEmail.trim() === '') && user && user.email) {
          finalEmail = user.email;
        }
        reporter = userIdVal ? userIdVal : null;
      } catch (err) {
        console.warn('Error finding user for contact form:', err);
        // Continue without reporter - allow anonymous submissions
      }
    }
    // If still no email, return error
    if (!finalEmail || finalEmail.trim() === '') {
      return res.status(400).json({ message: 'Email is required. Please provide your email or log in.' });
    }

    // Sanitize description
    const filter = new Filter.Filter();
    const cleanDescription = filter.clean(description);

    // If commissionId is provided, try to find the commission
    let commission = null;
    if (commissionId) {
      try {
        commission = await CommissionRequest.findById(commissionId).select('customer artist disputedByCustomer disputedByArtist disputeCreatedBy');
        if (!commission) {
          return res.status(404).json({ message: 'Commission not found for provided commissionId.' });
        }
      } catch (err) {
        return res.status(400).json({ message: 'Invalid commissionId format.' });
      }
    }

    const newEntry = new contactForm({
      email: finalEmail,
      description: cleanDescription,
      type,
      reporter,
      ...(commissionId ? { commissionId } : {}) // Only add commissionId if provided
    });

    await newEntry.save();

    // If commission and user are present, set dispute reference
    if (commission && req.userId) {
      let updated = false;
      if (commission.customer && commission.customer.toString() === req.userId) {
        commission.disputedByCustomer = newEntry._id;
        updated = true;
      } else if (commission.artist && commission.artist.toString() === req.userId) {
        commission.disputedByArtist = newEntry._id;
        updated = true;
      }
      if (updated) {
        commission.disputeCreatedBy = req.userId;
        await commission.save();
      }
    }

    console.log('Contact form entry created:', { 
      id: newEntry._id, 
      type: newEntry.type, 
      email: newEntry.email,
      hasReporter: !!reporter 
    });
    
    return res.status(201).json({ 
      message: 'Contact form submitted successfully. We will review your message and get back to you soon.',
      success: true
    });
  } catch (error) {
    console.error('Error creating contact form entry:', error);
    return res.status(500).json({ 
      error: 'Failed to submit contact form. Please try again later.',
      success: false 
    });
  }
};

/**
 * @route GET /report
 * @description Get all contact form entries with pagination and filtering (admin only)
 * @access Admin
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 20, max: 100)
 * @query {string} status - Filter by status: open, in_progress, resolved, closed
 * @query {string} type - Filter by type: general, bug_report, feature_request, user_report, other, commission_dispute, copyright_complaint
 * @returns {Object} Paginated entries with summary statistics
 */
export const getContactFormEntries = async (req, res) => {
  try {
    // Add pagination support
    const { page = 1, limit = 20, status, type } = req.query;
    let pageNum = parseInt(page, 10);
    if (isNaN(pageNum) || pageNum < 1) pageNum = 1;
    let limitNum = parseInt(limit, 10);
    if (isNaN(limitNum) || limitNum < 1) limitNum = 20;
    if (limitNum > 100) limitNum = 100; // Cap at 100

    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter = {};
    if (status && ['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
      filter.status = status;
    }
    if (type && [
      'general',
      'bug_report',
      'feature_request',
      'user_report',
      'other',
      'commission_dispute',
      'copyright_complaint'
    ].includes(type)) {
      filter.type = type;
    }

    // Get total count for pagination
    const totalEntries = await contactForm.countDocuments(filter);
    
    // Get entries with pagination
    const entries = await contactForm.find(filter)
      .populate({
        path: 'reporter',
        select: 'username email',
        model: 'User'
      })
      .sort({ createdAt: -1 }) // Newest first
      .skip(skip)
      .limit(limitNum);

    // For each entry, if reporter exists, set entry.email = reporter.email
    const entriesWithUserEmail = entries.map(entry => {
      const obj = entry.toObject();
      if (obj.reporter && obj.reporter.email) {
        obj.email = obj.reporter.email;
      }
      return obj;
    });

    const totalPages = Math.ceil(totalEntries / limitNum);

    return res.status(200).json({
      entries: entriesWithUserEmail,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalEntries,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
        limit: limitNum
      },
      summary: {
        total: totalEntries,
        open: await contactForm.countDocuments({ ...filter, status: 'open' }),
        in_progress: await contactForm.countDocuments({ ...filter, status: 'in_progress' }),
        resolved: await contactForm.countDocuments({ ...filter, status: 'resolved' })
      }
    });
  } catch (error) {
    console.error('Error retrieving contact form entries:', error);
    return res.status(500).json({ error: 'Failed to retrieve contact form entries.' });
  }
};

/**
 * @route PATCH /report/:id
 * @description Update a contact form entry status (admin endpoint)
 * @access Private (admin only)
 * @param {string} id - Contact form entry ID
 * @body {string} status - New status value: open, in_progress, resolved, closed
 * @returns {Object} Updated contact form entry
 */
export const updateContactFormEntry = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        
        console.log('[DEBUG] PATCH /report/:id', { id, status, body: req.body });
        
        if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
            console.log('[DEBUG] Invalid status value:', status);
            return res.status(400).json({ message: 'Invalid status value. Must be one of: open, in_progress, resolved, closed.' });
        }
        
        const entry = await contactForm.findByIdAndUpdate(
            id, 
            { status }, 
            { new: true }
        ).populate('reporter', 'username email');
        
        if (!entry) {
            console.log('[DEBUG] Contact form entry not found for id:', id);
            return res.status(404).json({ message: 'Contact form entry not found.' });
        }
        
        // If status is closed, delete the entry
        if (status === 'closed') {
            await contactForm.findByIdAndDelete(id);
            console.log('[DEBUG] Contact form entry closed and removed:', id);
            return res.status(200).json({ 
                message: 'Contact form entry closed and removed successfully.',
                success: true
            });
        }
        
        console.log('[DEBUG] Contact form entry updated:', entry);
        return res.status(200).json({ 
            message: 'Contact form entry updated successfully.', 
            entry,
            success: true
        });
    } catch (error) {
        console.error('Error updating contact form entry:', error);
        return res.status(500).json({ 
            error: 'Failed to update contact form entry.',
            success: false
        });
    }
};

/**
 * @route GET /report/:id
 * @description Retrieve a single contact form entry by ID (admin endpoint)
 * @access Private (admin only)
 * @param {string} id - Contact form entry ID
 * @returns {Object} Contact form entry details
 */
export const getContactFormEntry = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entry = await contactForm.findById(id).populate('reporter', 'username email avatar');
    
    if (!entry) {
      return res.status(404).json({ message: 'Contact form entry not found.' });
    }
    
    return res.status(200).json(entry);
  } catch (error) {
    console.error('Error retrieving contact form entry:', error);
    return res.status(500).json({ error: 'Failed to retrieve contact form entry.' });
  }
};

/**
 * @route DELETE /report/:id
 * @description Delete a contact form entry (admin endpoint)
 * @access Private (admin only)
 * @param {string} id - Contact form entry ID
 * @returns {Object} Success message
 */
export const deleteContactFormEntry = async (req, res) => {
  try {
    const { id } = req.params;
    
    const entry = await contactForm.findByIdAndDelete(id);
    
    if (!entry) {
      return res.status(404).json({ message: 'Contact form entry not found.' });
    }
    
    console.log('[DEBUG] Contact form entry deleted:', id);
    return res.status(200).json({ 
      message: 'Contact form entry deleted successfully.',
      success: true
    });
  } catch (error) {
    console.error('Error deleting contact form entry:', error);
    return res.status(500).json({ 
      error: 'Failed to delete contact form entry.',
      success: false
    });
  }
};

/**
 * @route GET /report/stats
 * @description Retrieve contact form statistics (admin endpoint)
 * @access Private (admin only)
 * @returns {Object} Contact form statistics
 */
export const getContactFormStats = async (req, res) => {
  try {
    const stats = {
      total: await contactForm.countDocuments(),
      byStatus: {
        open: await contactForm.countDocuments({ status: 'open' }),
        in_progress: await contactForm.countDocuments({ status: 'in_progress' }),
        resolved: await contactForm.countDocuments({ status: 'resolved' }),
        closed: await contactForm.countDocuments({ status: 'closed' })
      },
      byType: {
        general: await contactForm.countDocuments({ type: 'general' }),
        bug_report: await contactForm.countDocuments({ type: 'bug_report' }),
        feature_request: await contactForm.countDocuments({ type: 'feature_request' }),
        user_report: await contactForm.countDocuments({ type: 'user_report' }),
        other: await contactForm.countDocuments({ type: 'other' })
      },
      recentActivity: {
        today: await contactForm.countDocuments({
          createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }),
        thisWeek: await contactForm.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }),
        thisMonth: await contactForm.countDocuments({
          createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        })
      }
    };
    
    return res.status(200).json(stats);
  } catch (error) {
    console.error('Error retrieving contact form stats:', error);
    return res.status(500).json({ error: 'Failed to retrieve contact form statistics.' });
  }
};