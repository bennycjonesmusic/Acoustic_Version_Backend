import jwt from 'jsonwebtoken';
import { logError } from '../utils/errorLogger.js'; // Import error logging 
import dotenv from 'dotenv';

// Middleware is a function that has access to the request (req), response (res), and next().
// It can read or modify the request (e.g. check if a user is authenticated),
// and either respond to the client or pass control to the next middleware or route handler.

   
const authMiddleware = async (req, res, next) => {
    const authHeader = req.header('Authorization'); //pull http header from the request. 
    console.log('[authMiddleware] Authorization header:', authHeader);
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('[authMiddleware] No token provided');
        await logError({
            message: 'Unauthorized: No token provided',
            errorType: 'authentication'
        }, req, 401);
        return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }
    const token = authHeader.split(' ')[1];  //was getting an error in postman. Let us try this. split the token, access it via index[1]
    if (!token) {
        console.log('[authMiddleware] Token split failed');
        await logError({
            message: 'Access denied. No token provided.',
            errorType: 'authentication'
        }, req, 401);
        return res.status(401).json({message: "Access denied. No token provided."}); //401 means unauthorized. Locked out.
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); //verify the token. This will check for token validity.
        req.user = decoded;  //if token is valid, set the user to the decoded token. 
        req.userId = decoded.id; //we do this so that we can access the user ID in further middleware, because decoded id gives us the user ID.
        console.log('[authMiddleware] Token valid, userId:', req.userId);
        next(); //call the next middleware function. 
    } catch (error) {
        // Log authentication failure
        await logError({
            message: `Authentication failed: ${error.message}`,
            stack: error.stack,
            errorType: 'authentication'
        }, req, 401);

        //If token is invalid, return 401.;
        console.error('[authMiddleware] Invalid token', error);
        return res.status(401).json({message: "Invalid token."});
    }





};

export default authMiddleware; //export the middleware. This will be used in server.js to protect the routes. I.e Only allow users to access certain parts of the website (if they are logged in)