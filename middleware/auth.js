import jwt from 'jsonwebtoken'; 

// Middleware is a function that has access to the request (req), response (res), and next().
// It can read or modify the request (e.g. check if a user is authenticated),
// and either respond to the client or pass control to the next middleware or route handler.

const authMiddleware = (req, res, next) => {
    const token = req.header('Authorization'); //pull http header from the request. 
    if (! token) {

        //if token does not exist, return 401.
   
        return res.status(401).json({message: "Access denied. No token provided."}); //401 means unauthorized. Locked out.
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET); //verify the token. This will check for token validity.
        req.user = decoded; //if token is valid, set the user to the decoded token. can now access user through protected routes.
        next(); //call the next middleware function. 
    } catch (error) {

            //If token is invalid, return 401.;


        console.error("invalid token", error);
        return res.status(401).json({message: "Invalid token."});
    }





};

export default authMiddleware; //export the middleware. This will be used in server.js to protect the routes. I.e Only allow users to access certain parts of the website (if they are logged in)