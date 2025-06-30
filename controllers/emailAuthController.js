import dotenv from 'dotenv'; 
dotenv.config(); 
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { sendVerificationEmail } from '../utils/emailAuthentication.js';



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

        // If the user is already verified, redirect to the success page
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3002';
        if (user.verified) {
            return res.redirect(`${frontendUrl}/email-verified`);
        }

        // Mark the user as verified
        user.verified = true;
        await user.save();

        // Redirect to the success page after verification
        return res.redirect(`${frontendUrl}/email-verified`);

    } catch (error) {
        console.error('Error verifying email:', error);
        return res.status(500).json({ message: "Failed to verify email." });
    }
};

export const resendEmail = async(req, res) => { //controller to resend verification email
    const { email } = req.body; //destructure email from body

    if (!email) {
        return res.status(400).json({message: "Email is required"});
    }

    try {
        const user = await User.findOne({email});
        if (!user) {
            return res.status(404).json({message: "User not found"});
        }
        if (user.verified) {
            return res.status(400).json({message: "Email already verified"});
        }
        const token = jwt.sign(
            {userId: user._id},
            process.env.EMAIL_VERIFICATION_SECRET,
            {expiresIn: '24h'}
        );
        await sendVerificationEmail(user.email, token);
        return res.status(200).json({message: "Verification email successfully sent"});
    } catch (error) {
        console.error("Error resending verification email", error);
        return res.status(500).json({message: "Failed to resend email. Server error"});
    }
}