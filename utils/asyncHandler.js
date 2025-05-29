// utils/asyncHandler.js
// Helper to wrap async route handlers and pass errors to Express
export const asyncHandler = fn => (req, res, next) => {
  // Diagnostic log to confirm asyncHandler is wrapping the route
  console.log('[asyncHandler] called for', req.method, req.url);
  try {
    Promise.resolve(fn(req, res, next)).catch(next);
  } catch (err) {
    console.error('[asyncHandler] synchronous error:', err);
    next(err);
  }
};
