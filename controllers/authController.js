import fs from 'fs';
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'; //going to use in register as well, to authenticate email
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import * as Filter from 'bad-words'; //package to prevent profanity. due to import issues, using import * as Filter
import zxcvbn from 'zxcvbn'; //package for password strength
import { validateEmail } from '../utils/emailValidator.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/emailAuthentication.js';
import { registerSchema, loginSchema, artistAboutSchema } from './validationSchemas.js';
import crypto from 'crypto';
import adminEmails from '../utils/admins.js';

//Create...
export const register = async (req, res) => {
    // Validate input using Joi schema
    const { error } = registerSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }
    try {
        const { username, email, password, role = "user", about } = req.body;
        let avatar = req.body.avatar;
        // Handle avatar file upload to S3 if file is provided
        if (req.file && req.file.buffer) {
            const s3Client = new S3Client({
                region: process.env.AWS_REGION,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                },
            });
            const uploadParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: `avatars/${Date.now()}-${req.file.originalname}`,
                Body: Buffer.from(req.file.buffer),
                ACL: 'private',
                StorageClass: 'STANDARD',
            };
            const data = await new Upload({ client: s3Client, params: uploadParams }).done();
            avatar = data.Location;
        }
        const existingUser = await User.findOne({ $or: [ {email } , { username } ] });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists!" });
        }

        const profanity = new Filter.Filter();
        if (profanity.isProfane(username)){
            return res.status(400).json({message: "Vulgar language detected. Please use nice words."})
        }
        if (role === 'artist' || role === 'admin') {
            if (profanity.isProfane(about)){
                return res.status(400).json({message: "Vulgar language detected. Please use nice words."})
            }
            if (typeof about !== 'string' || about.length > 1000) {
                return res.status(400).json({message: "About section must be a string and less than 1000 characters."});
            }
            // Validate avatar (must be a valid image URL) if not uploaded and only if present
            if (avatar !== undefined && !(req.file && req.file.buffer)) {
                const urlPattern = /^(https?:\/\/)[^\s]+\.(jpg|jpeg|png|gif|webp)$/i;
                if (typeof avatar !== 'string' || !urlPattern.test(avatar)) {
                    return res.status(400).json({ message: 'Avatar must be a valid image URL (jpg, jpeg, png, gif, webp).' });
                }
            }
        } else {
            // For non-artist/admin, ignore or skip about and avatar validation
            // Optionally, you could delete about and avatar if present: delete req.body.about; delete req.body.avatar;
        }
        const isEmailValid = await validateEmail(email);
        if (! isEmailValid){
            return res.status(400).json({message: "Invalid email, please try a different email"});
        }
        const passwordStrength = zxcvbn(password);
        if (passwordStrength.score < 3){
            return res.status(400).json({message: "Password is too weak. Needs more power."});
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        // Only send role, about, avatar if artist or admin
        let userData = { username, email, password: hashedPassword };
        if (adminEmails.includes(email)) {
            userData.role = 'admin';
            userData.about = about;
            userData.avatar = avatar;
        } else if (role === 'artist') {
            userData = { ...userData, role, about, avatar };
        } else if (process.env.NODE_ENV === 'test' && role) {
            userData.role = role;
        }
        const newUser = new User(userData);
        await newUser.save();

        const token = jwt.sign(
        { userId: newUser._id },
         process.env.EMAIL_VERIFICATION_SECRET,
        { expiresIn: '1d' }
        );

await sendVerificationEmail(email, token);
        res.status(201).json({ message: "User has been registered!" });
    } catch (error) {
        console.error('Error checking for existing user:', error);
        return res.status(500).json({ message: "Internal server error" });
    }
};

//Read... need more read functions such as displaying your profile details e.t.c
export const login = async (req, res) => {
    // Validate input using Joi schema
    const { error } = loginSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }
    try {
        const { login, password } = req.body;
        const user = await User.findOne({$or: [{email: login}, {username: login}]});
        if (!user) {
            return res.status(400).json({ message: "Invalid email or password" });
        }
        if (user.isBanned && user.isBanned()) {
            return res.status(403).json({ message: "Your account has been banned. Please contact support." });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid email or password" });
        }
        const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
        res.status(200).json({ token, message: "Logged in successfully!" });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};



//Part of update
export const updateS3Key = async (req, res) => {
    try {
        const track = await BackingTrack.findById(req.params.id);
        if (!track) {
            return res.status(404).json({ message: "Track not found." });
        }
        if (track.user.toString() !== req.userId) {
            return res.status(403).json({ message: "You are not authorized to update this track." });
        }
        const updatedTrack = await BackingTrack.findByIdAndUpdate(
            req.params.id,
            { s3Key: req.body.s3Key },
            { new: true }
        );
        res.status(200).json({ message: 'S3 Key updated successfully', track: updatedTrack });
    } catch (error) {
        console.error('Error updating s3Key:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};


//Delete

export const deleteAccount = async(req, res) => {

    try {

    const user =  await User.findById(req.userId);

    if (! user){

        return res.status(404).json({message: "Error fetching user/user not found"});
    }
   const {password} = req.body;

    const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid password"});
        }
   
   
    await User.findByIdAndDelete(req.userId);

    return res.status(200).json({message: "Account successfully deleted"});
    }catch(error){
        console.error("Error deleting account:", error);

        return res.status(500).json({message: "There has been an error with deleting your account"});
    }


}


export const changePassword = async(req, res) => { //export function to change password

try {

    const user = await User.findById(req.userId); //find user by JW token id from authmiddleware.

    if (! user){

        return res.status(404).json({message: "User not found. Please login again"})
    }

     const {password, newPassword} = req.body;

      const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid password"});
        }

         if (password === newPassword) {
            return res.status(400).json({ message: "New password must be different from the current password" });
        }


         const passwordStrength = zxcvbn(newPassword);
        if (passwordStrength.score < 3){

            return res.status(400).json({message: "Password is too weak. Needs more power."});
        }
         const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        return res.status(200).json({message: "Successfully changed password"});



}
catch(error) {

return res.status(500).json({message: "Internal server error. Oops"})


};







};


export const getUserProfile = async(req, res) =>
{

    try{

        const user = await User.findById(req.userId).select('-password').populate('boughtTracks').populate('uploadedTracks'); //exclude password for security reasons

        if (! user){


            return res.status(404).json({message: "User not found"});
        }



      return res.status(200).json({
  user: user.toJSON({
    viewerRole: user.role,
    viewerId: req.userId
  })
});








    } catch(error){


        return res.status(500).json({message: "Internal server error"});



    }



}

// Update artist 'about' field
export const updateAbout = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role !== 'artist') {
      return res.status(403).json({ message: 'Only artists can update the about section.' });
    }
    const { about } = req.body;
    // Joi validation
    const { error } = artistAboutSchema.validate({ about });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }
    // Profanity filter
    const profanity = new Filter.Filter();
    if (profanity.isProfane(about)) {
      return res.status(400).json({ message: 'Please avoid using inappropriate language.' });
    }
    user.about = about;
    await user.save();
    return res.status(200).json({ message: 'About section updated successfully', about: user.about });
  } catch (error) {
    console.error('Error updating about section:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    const user = await User.findOne({ email });
    if (!user) return res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
    // Generate token
    const token = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = token;
    user.passwordResetExpires = Date.now() + 1000 * 60 * 60; // 1 hour
    await user.save();
    // Send email (implement sendPasswordResetEmail)
    await sendPasswordResetEmail(user.email, token);
    return res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (error) {
    console.error('Error requesting password reset:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: 'Token and new password are required.' });
    const user = await User.findOne({ passwordResetToken: token, passwordResetExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ message: 'Invalid or expired token.' });
    // Validate password strength if needed
    user.password = await bcrypt.hash(newPassword, 10);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    return res.status(200).json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Error resetting password:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

// Update user profile (avatar, about, etc.)
export const updateProfile = async (req, res) => {
  try {
    const allowedFields = ['about'];
    const updates = allowedFields.reduce((acc, key) => {
      if (req.body[key] !== undefined) acc[key] = req.body[key];
      return acc;
    }, {});

    // If an avatar file was uploaded, set the avatar field to the S3 URL
    if (req.file && req.file.location) {
      updates.avatar = req.file.location;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update.' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.role !== 'artist' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Only artists or admins can update their profile.' });
    }
    // Profanity and length check for 'about'
    if (updates.about !== undefined) {
      const profanity = new Filter.Filter();
      if (profanity.isProfane(updates.about)) {
        return res.status(400).json({ message: 'Please avoid using inappropriate language in your about section.' });
      }
      if (typeof updates.about !== 'string' || updates.about.length > 1000) {
        return res.status(400).json({ message: 'About section must be a string and less than 1000 characters.' });
      }
    }
    // No need to validate avatar here, multer-s3 already does it

    Object.assign(user, updates);
    await user.save();
    return res.status(200).json({ message: 'Profile updated.', user });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to update profile.' });
  }
};