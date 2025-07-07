import Website from '../models/website.js';

/**
 * Log an error to the Website collection for tracking
 * Automatically expires after 7 days via MongoDB TTL
 * @param {Object} errorData - Error information
 * @param {string} errorData.message - Error message
 * @param {string} errorData.stack - Error stack trace
 * @param {string} errorData.errorType - Type of error (general, stripe_webhook, stripe_payment, auth, database, validation)
 * @param {string} errorData.stripeEventType - Stripe event type (for webhook errors)
 * @param {Object} req - Express request object (optional)
 * @param {number} statusCode - HTTP status code (optional)
 */
export const logError = async (errorData, req = null, statusCode = 500) => {
  try {
    // Don't log errors in test environment to avoid cluttering test data
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    // Sanitize request body - remove sensitive data
    const sanitizeRequestBody = (body) => {
      if (!body || typeof body !== 'object') return body;
      
      const sanitized = { ...body };
      const sensitiveFields = ['password', 'token', 'secret', 'key', 'authorization'];
      
      for (const field of sensitiveFields) {
        if (sanitized[field]) {
          sanitized[field] = '[REDACTED]';
        }
      }
      
      return sanitized;
    };

    const errorEntry = {
      message: errorData.message || 'Unknown error',
      stack: errorData.stack,
      errorType: errorData.errorType || 'general',
      timestamp: new Date()
    };

    // Add Stripe-specific fields if provided
    if (errorData.stripeEventType) {
      errorEntry.stripeEventType = errorData.stripeEventType;
    }

    // Add request information if available
    if (req) {
      errorEntry.endpoint = req.path || req.url;
      errorEntry.method = req.method;
      errorEntry.ip = req.ip || req.headers['x-forwarded-for'] || req.connection?.remoteAddress;
      errorEntry.userAgent = req.headers['user-agent'];
      errorEntry.requestBody = sanitizeRequestBody(req.body);
      
      // Add user info if authenticated
      if (req.userId) {
        errorEntry.userId = req.userId;
      }
      if (req.user?.email) {
        errorEntry.userEmail = req.user.email;
      }
    }

    if (statusCode) {
      errorEntry.statusCode = statusCode;
    }

    // Find the website document and add the error
    const result = await Website.updateOne(
      {}, // Match the first/only website document
      { 
        $push: { 
          errorLog: errorEntry 
        } 
      },
      { upsert: true } // Create website document if it doesn't exist
    );
    console.log('Website.updateOne result:', result);

    // Optional: Log to console for immediate debugging (in development)
    if (process.env.NODE_ENV !== 'production') {
      console.error('Error logged to database:', {
        message: errorEntry.message,
        endpoint: errorEntry.endpoint,
        userId: errorEntry.userId,
        timestamp: errorEntry.timestamp
      });
    }

  } catch (logError) {
    // Don't let error logging break the application
    console.error('Failed to log error to database:', logError);
  }
};

/**
 * Log a frontend error to the Website collection
 * @param {Object} frontendErrorData - Frontend error information
 * @param {string} frontendErrorData.message - Error message
 * @param {string} frontendErrorData.stack - Error stack trace
 * @param {string} frontendErrorData.url - URL where the error occurred
 * @param {string} frontendErrorData.userAgent - User agent string of the client
 * @param {Object} frontendErrorData.viewport - Viewport dimensions at the time of the error
 * @param {string} frontendErrorData.userId - ID of the authenticated user (if available)
 * @param {string} frontendErrorData.componentStack - React component stack trace (if available)
 * @param {string} frontendErrorData.errorType - Type of error (frontend, validation, etc.)
 */
export const logFrontendError = async (frontendErrorData) => {
  try {
    // Don't log errors in test environment to avoid cluttering test data
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const frontendErrorEntry = {
      message: frontendErrorData.message || 'Unknown frontend error',
      stack: frontendErrorData.stack,
      url: frontendErrorData.url,
      userAgent: frontendErrorData.userAgent,
      viewport: frontendErrorData.viewport,
      userId: frontendErrorData.userId,
      componentStack: frontendErrorData.componentStack,
      errorType: frontendErrorData.errorType || 'frontend',
      timestamp: new Date()
    };

    // Find the website document and add the frontend error
    const result = await Website.updateOne(
      {}, // Match the first/only website document
      { 
        $push: { 
          frontendErrorLog: frontendErrorEntry 
        } 
      },
      { upsert: true } // Create website document if it doesn't exist
    );
    console.log('Website.updateOne result:', result);

    // Optional: Log to console for immediate debugging (in development)
    if (process.env.NODE_ENV !== 'production') {
      console.error('Frontend error logged to database:', {
        message: frontendErrorEntry.message,
        url: frontendErrorEntry.url,
        userId: frontendErrorEntry.userId,
        timestamp: frontendErrorEntry.timestamp
      });
    }

  } catch (logError) {
    // Don't let error logging break the application
    console.error('Failed to log frontend error to database:', logError);
  }
};

/**
 * Get recent errors from the database (admin only)
 * @param {number} limit - Maximum number of errors to return (default: 50)
 * @returns {Array} Array of recent errors
 */
export const getRecentErrors = async (limit = 50) => {
  try {
    const website = await Website.findOne().select('errorLog');
    if (!website || !website.errorLog) {
      return [];
    }

    // Sort by timestamp (newest first) and limit results
    const recentErrors = website.errorLog
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    return recentErrors;
  } catch (error) {
    console.error('Failed to retrieve recent errors:', error);
    return [];
  }
};

/**
 * Get error statistics for admin dashboard
 * @returns {Object} Error statistics
 */
export const getErrorStats = async () => {
  try {
    const website = await Website.findOne().select('errorLog');
    if (!website || !website.errorLog) {
      return {
        totalErrors: 0,
        last24Hours: 0,
        last7Days: 0,
        commonEndpoints: [],
        commonErrors: []
      };
    }

    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const errors = website.errorLog;
    const recentErrors24h = errors.filter(err => new Date(err.timestamp) > last24Hours);
    const recentErrors7d = errors.filter(err => new Date(err.timestamp) > last7Days);

    // Count common endpoints
    const endpointCounts = {};
    const errorCounts = {};

    recentErrors7d.forEach(err => {
      if (err.endpoint) {
        endpointCounts[err.endpoint] = (endpointCounts[err.endpoint] || 0) + 1;
      }
      if (err.message) {
        errorCounts[err.message] = (errorCounts[err.message] || 0) + 1;
      }
    });

    const commonEndpoints = Object.entries(endpointCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([endpoint, count]) => ({ endpoint, count }));

    const commonErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));

    return {
      totalErrors: errors.length,
      last24Hours: recentErrors24h.length,
      last7Days: recentErrors7d.length,
      commonEndpoints,
      commonErrors
    };

  } catch (error) {
    console.error('Failed to calculate error statistics:', error);
    return {
      totalErrors: 0,
      last24Hours: 0,
      last7Days: 0,
      commonEndpoints: [],
      commonErrors: []
    };
  }
};
