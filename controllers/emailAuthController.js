import dotenv from 'dotenv'; 
dotenv.config(); 
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendVerificationEmail } from '../utils/emailAuthentication.js';

//generated with ai come BACK to this!

export const verifyEmail = async (req, res) => {
    try {
        // Get the token from the query parameter
        const { token } = req.query;
        
        if (!token) {
            return res.status(400).json({ message: "No token provided!" });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.EMAIL_VERIFICATION_SECRET);

        // Check if the decoded token contains a userId
        const userId = decoded.userId;

        // Find the user in the database by userId
        const user = await User.findById(userId);

        if (!user) {
            return res.status(400).json({ message: "Invalid token. User not found." });
        }

        // If the user is already verified, return a message
        if (user.verified) {
            return res.status(200).json({ message: "Email already verified." });
        }

        // Mark the user as verified
        user.verified = true;
        await user.save();

        res.status(200).json({ message: "Email successfully verified!" });

    } catch (error) {
        console.error('Error verifying email:', error);
        res.status(500).json({ message: "Failed to verify email." });
    }
};

export const resendEmail = async(req, res) => { //controller to resend verification email

    const { email } = req.body; //destructure email from body
    const validateUser = req.userId;


   

    if (! email){ //check for email

        return res.status(400).json({message: "Email is required"})
    }


    try {

        const user = await User.findOne({email}); //clean way of writing email: email.. email being the email destructured from req.body

       if (validateUser.toString() !== user._id.toString()){

            return res.status(403).json({message: "You are not authorized to do this"})
        }
        if (! user){

            return res.status(404).json({message: "User not found"});
        }

        if (user.verified) {

            return res.status(400).json({message: "Email already verified"})

        }

        const token = jwt.sign(

            {userId: user._id},
            process.env.EMAIL_VERIFICATION_SECRET,
            {expiresIn: '24h'}



        );

        await sendVerificationEmail(user.email, token);


        user.verified = true;
        await user.save(); //should fix bug


        return res.status(200).json({message: "Verification email successfully sent"});


    } catch (error){

        console.error("Error resending verification email", error);
        return res.status(500).json({message: "Failed to resend email. Server error"});


    }


}