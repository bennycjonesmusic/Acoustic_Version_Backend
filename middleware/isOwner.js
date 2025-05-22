import dotenv from 'dotenv';
dotenv.config();

// Owner-only middleware. Allows only the owner to access certain routes.
const isOwner = (req, res, next) => {
    if (req.user && req.user.email === process.env.OWNER_EMAIL) {
        return next();
    } else {
        return res.status(403).json({ message: "You are not authorized to perform this action as you are not the owner." });
    }
};

export default isOwner;