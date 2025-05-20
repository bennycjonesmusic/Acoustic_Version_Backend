import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

// Optional authentication middleware for public routes
const publicMiddleware = (req, res, next) => {
  const authHeader = req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      req.userId = decoded.id;
      req.userRole = decoded.role;
    } catch (error) {
      // Token was invalid — treat as unauthenticated (but don't block the request)
      console.warn('Invalid token provided. Proceeding as public.');
    }
  }

  // No token = set userRole as public
  if (!req.userRole) req.userRole = 'public';
  if (!req.userId) req.userId = null;

  next();
};

export default publicMiddleware;