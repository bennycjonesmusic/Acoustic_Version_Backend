import rateLimit from 'express-rate-limit';

const noop = (req, res, next) => next();

let registerLimiter, uploadLimiter, downloadLimiter, loginLimiter, paymentLimiter, commissionLimiter;

if (process.env.NODE_ENV === 'test') {
  registerLimiter = noop;
  uploadLimiter = noop;
  downloadLimiter = noop;
  loginLimiter = noop;
  paymentLimiter = noop;
  commissionLimiter = noop;
} else {
  registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Reduced from 10 for better security
    message: { error: 'Too many registration attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes  
    max: 10, // 10 login attempts per 15 minutes
    message: { error: 'Too many login attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  uploadLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    max: 10,
    message: { error: 'Too many tracks uploaded today. Only 10 per day. Please upload more tomorrow.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  downloadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // Increased for legitimate users but still prevents abuse
    message: { error: 'Too many downloads from this IP, please try again in an hour.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Payment operations should be heavily rate limited
  paymentLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 5, // Max 5 payment attempts per 5 minutes
    message: { error: 'Too many payment attempts, please wait before trying again.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Commission requests rate limiting
  commissionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Max 3 commission requests per hour
    message: { error: 'Too many commission requests, please wait before submitting another.' },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

export { registerLimiter, uploadLimiter, downloadLimiter, loginLimiter, paymentLimiter, commissionLimiter };
