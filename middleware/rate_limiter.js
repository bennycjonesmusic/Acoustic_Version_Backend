import rateLimit from 'express-rate-limit'; //limit how many times someone can use my API within a period of time.

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 requests per window (15 minutes)
  message: 'Too many registration attempts, please try again later.',
});

export { registerLimiter };

const uploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 1 day 
  max: 10, // Max 5 requests per window (15 minutes)
  message: 'Too many tracks uploaded today. Only 10 per day. Please upload more tomorrow :).',
});

export {uploadLimiter};

const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // Max 20 downloads per hour
  message: 'Too many downloads from this IP, please try again in an hour.'
});

export { downloadLimiter };
