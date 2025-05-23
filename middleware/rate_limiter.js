import rateLimit from 'express-rate-limit';

const noop = (req, res, next) => next();

let registerLimiter, uploadLimiter, downloadLimiter;

if (process.env.NODE_ENV === 'test') {
  registerLimiter = noop;
  uploadLimiter = noop;
  downloadLimiter = noop;
} else {
  registerLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many registration attempts, please try again later.',
  });

  uploadLimiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 10,
    message: 'Too many tracks uploaded today. Only 10 per day. Please upload more tomorrow :).',
  });

  downloadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    message: 'Too many downloads from this IP, please try again in an hour.'
  });
}

export { registerLimiter, uploadLimiter, downloadLimiter };
