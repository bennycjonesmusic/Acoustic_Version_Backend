import jwt from 'jsonwebtoken'; 
import dotenv from 'dotenv';
//Middleware specifically for artist authentication.

const artistAuthMiddleware = (req, res, next) => {
   const authHeader = req.header('Authorization'); //pull http header from the request. 
    
const token = authHeader.split(' ')[1];  // was getting an error, so let us try this. Will split the token from "bearer".
if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
    //already stated previously that 401 means unauthorized. But as it is my first project, I will repeat for my own learning.
}
try {

    const decoded = jwt.verify(token, process.env.JWT_SECRET); //verify token.
    if (decoded.role !== 'artist') {

     return res.status(403).json({ message: "Access denied. Please log in as an artist."}); //403 means forbidden. Like a chastity belt.
    }

    req.user = decoded;
    req.userId = decoded.id; //store the user ID in request object

    next(); //call route handler

} catch(error) {



    return res.status(401).json({ message: "Token is invalid." });



}


};


export default artistAuthMiddleware; //export the middleware.