import jwt from 'jsonwebtoken'; 

//Middleware specifically for artist authentication.

const artistAuthMiddleware = (req, res, next) => {

const token = req.header('Authorization');
if (!token) {
    return res.status(401).json({ message: "Access denied. No token provided." });
    //already stated previously that 401 means unauthorized. But as it is my first project, I will repeat for my own learning.
}
try {

    const decoded = jwt.verify(token, process.env.JWT_SECRET); //verify token.
    if (decoded.role !== 'artist') {

     return res.status(403).json({ message: "Access denied. Please log in as an artist."}); //403 means forbidden. Like a chastity belt.
    }


} catch(error) {



    return res.status(401).json({ message: "Token is invalid." });



}


};