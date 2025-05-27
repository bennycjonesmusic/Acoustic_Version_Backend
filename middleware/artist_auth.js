import jwt from 'jsonwebtoken'; 
import dotenv from 'dotenv';
// Middleware for artist or admin authentication ONLY
const artistOrAdminAuthMiddleware = (req, res, next) => {
   const authHeader = req.header('Authorization');
   if (!authHeader) {
      return res.status(401).json({ message: "Access denied. No token provided." });
   }
   const token = authHeader.split(' ')[1];
   if (!token) {
      return res.status(401).json({ message: "Access denied. No token provided." });
   }
   try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.role !== 'artist' && decoded.role !== 'admin') {
         return res.status(403).json({ message: "Access denied. Please log in as an artist or admin." });
      }
      req.user = decoded;
      req.userId = decoded.id;
      next();
   } catch(error) {
      return res.status(401).json({ message: "Token is invalid." });
   }
};

export default artistOrAdminAuthMiddleware;