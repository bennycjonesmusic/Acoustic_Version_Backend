import dotenv from 'dotenv';

dotenv.config();
//owner only middleware. Allows only me to access certain routes.
const isOwner = (req, res, next) => {

    //check if the user is logged in and if the email matches MY email.
    if (req.user.email === process.env.OWNER_EMAIL) {

        next();
    }
    else {
        return res.status(403).json({ message: "You are not authorized to perform this action."})
    }
}

export default isOwner;