import jwt from 'jsonwebtoken';
import User from '../models/User.js';

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
        if (user.isVerified) {
            return res.status(200).json({ message: "Email already verified." });
        }

        // Mark the user as verified
        user.isVerified = true;
        await user.save();

        res.status(200).json({ message: "Email successfully verified!" });

    } catch (error) {
        console.error('Error verifying email:', error);
        res.status(500).json({ message: "Failed to verify email." });
    }
};