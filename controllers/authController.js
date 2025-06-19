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
import { registerSchema, loginSchema, artistAboutSchema, artistInstrumentSchema } from './validationSchemas.js';
import { createWelcomeNotification, createArtistWelcomeNotification } from '../utils/notificationHelpers.js';
import crypto from 'crypto';
import adminEmails from '../utils/admins.js';
import makeAdmin from '../middleware/make_admin.js';
import { sanitizeFileName } from '../utils/regexSanitizer.js';

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
        // Use avatarUpload middleware: req.file.location will be set if avatar uploaded
        if (req.file && req.file.location) {
            avatar = req.file.location;
        }
        // Only require about for artists
        if (role === 'artist' && (about === undefined || about === null || about === '')) {
            return res.status(400).json({ message: "About section is required for artists." });
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
            }            // Validate avatar (must be a valid image URL) if not uploaded and only if present
            if (avatar !== undefined && !(req.file && req.file.buffer)) {
                const urlPattern = /^(https?:\/\/)[^\s]+\.(jpg|jpeg|png|gif|webp)$/i;
                if (typeof avatar !== 'string' || !urlPattern.test(avatar)) {
                    return res.status(400).json({ message: 'Avatar must be a valid image URL (jpg, jpeg, png, gif, webp).' });
                }
            }        } else {
            // For non-artist/admin, ignore or skip about and avatar validation
            // Optionally, you could delete about and avatar if present: delete req.body.about; delete req.body.avatar;
        }
        
        // Validate email format and availability
        try {
            const isEmailValid = await validateEmail(email);
            if (!isEmailValid) {
                return res.status(400).json({message: "Invalid email format. Please enter a valid email address."});
            }
        } catch (emailError) {
            console.error('Email validation error:', emailError.message);
            return res.status(500).json({message: "Email validation service unavailable. Please try again later."});
        }
        
        const passwordStrength = zxcvbn(password);
        if (passwordStrength.score < 3){
            return res.status(400).json({message: "Password is too weak. Needs more power."});
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        // Only send role, about, avatar if artist or admin
        let userData = { username, email, password: hashedPassword };
        // Always set profileStatus to 'approved' for admins, and to 'pending' for artists, else 'approved' for regular users
        if (adminEmails.includes(email)) {
            userData.role = 'admin';
            userData.about = about;
            userData.avatar = avatar;
            userData.profileStatus = 'approved';
            // Admins should also have commission abilities like artists
            userData.commissionPrice = req.body.commissionPrice || 0;
        } else if (role === 'artist') {
            userData = { ...userData, role, about, avatar, profileStatus: 'pending', commissionPrice: req.body.commissionPrice || 0 };
        } else if (process.env.NODE_ENV === 'test' && role) {
            userData.role = role;
            userData.profileStatus = 'approved';
        } else {
            userData.profileStatus = 'approved';
        }        const newUser = new User(userData);
        await newUser.save();        // Create welcome notifications for new users
        try {
            // Defensive coding: handle both _id and id fields
            const newUserId = newUser._id || newUser.id;
            if (newUserId) {
                if (userData.role === 'artist' || userData.role === 'admin') {
                    await createArtistWelcomeNotification(newUserId);
                    console.log(`Artist welcome notification created for new artist: ${username}`);
                } else {
                    await createWelcomeNotification(newUserId);
                    console.log(`Welcome notification created for new user: ${username}`);
                }
            } else {
                console.error('Could not create welcome notification: missing user ID');
            }
        } catch (notifError) {
            console.error('Error creating registration welcome notification:', notifError);
            // Don't fail registration if notification creation fails
        }

        // If artist or admin, remind to upload at least one example (for admin, show similar message)
        if (role === 'artist' || userData.role === 'admin') {
            return res.status(201).json({
                message: `${userData.role.charAt(0).toUpperCase() + userData.role.slice(1)} registered. Please upload at least one playing example. Your profile will remain hidden and pending approval until reviewed (for artists).`,
                userId: newUser._id,
                profileStatus: newUser.profileStatus
            });
        }

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
        const { login, password } = req.body;        const user = await User.findOne({$or: [{email: login}, {username: login}]});
        if (!user) {
            return res.status(400).json({ message: "Invalid username or password" });
        }
        if (user.isBanned && user.isBanned()) {
            return res.status(403).json({ message: "Your account has been banned. Please contact support." });
        }        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Invalid username or password" });
        }        // Set req.userId for downstream middleware
        req.userId = user._id;        // Check if this is the user's first login and their role
        const isFirstLogin = !user.hasLoggedInBefore;
        const isNonArtist = user.role === 'user';
        const isArtist = user.role === 'artist';
        
        // Update lastOnline timestamp and mark as logged in
        user.lastOnline = new Date();
        if (isFirstLogin) {
            user.hasLoggedInBefore = true;
        }
        await user.save();        // Create welcome notifications for first-time users
        if (isFirstLogin) {
            console.log('[AUTH DEBUG] First time login detected for user:', user.username);
            try {
                // Defensive coding: handle both _id and id fields
                const userId = user._id || user.id;
                console.log('[AUTH DEBUG] User ID for notification:', userId);
                  if (userId) {
                    if (isNonArtist) {
                        console.log('[AUTH DEBUG] Creating welcome notification for regular user');
                        const result = await createWelcomeNotification(userId);
                        console.log('[AUTH DEBUG] Welcome notification result:', result);
                        console.log(`Welcome notification created for user: ${user.username}`);
                    } else if (isArtist) {
                        console.log('[AUTH DEBUG] Creating artist welcome notification');
                        const result = await createArtistWelcomeNotification(userId);
                        console.log('[AUTH DEBUG] Artist welcome notification result:', result);
                        console.log(`Artist welcome notification created for artist: ${user.username}`);
                    }
                } else {
                    console.error('Could not create welcome notification: missing user ID');
                }
            } catch (notifError) {
                console.error('Error creating welcome notification:', notifError);
                // Don't fail the login if notification creation fails
            }
        } else {
            console.log('[AUTH DEBUG] Not first login, skipping notification for user:', user.username);
        }
          // Call makeAdmin middleware inline
        await makeAdmin(req, res, async () => {
            // Defensive coding: handle both _id and id fields
            const userId = user._id || user.id;
            const token = jwt.sign({ id: userId, email: user.email, role: user.role }, process.env.JWT_SECRET, { expiresIn: '2h' });
            res.status(200).json({ token, message: "Logged in successfully!" });
        });
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
   
   // Find all tracks uploaded by this user
   const userTracks = await BackingTrack.find({ user: req.userId });
   
   if (userTracks.length > 0) {
       // Find users who have purchased these tracks
       const tracksPurchasedByUser = await User.find({
           purchasedTracks: { $elemMatch: { track: { $in: userTracks.map(track => track._id) } } }
       });
       
       const purchasedTrackIds = new Set();
       for (const purchaser of tracksPurchasedByUser) {
           for (const purchasedTrack of purchaser.purchasedTracks) {
               purchasedTrackIds.add(purchasedTrack.track.toString());
           }
       }
       
       // Delete tracks that haven't been purchased by anyone
       const tracksToDelete = userTracks.filter(track => !purchasedTrackIds.has(track._id.toString()));
       
       if (tracksToDelete.length > 0) {
           await BackingTrack.deleteMany({ _id: { $in: tracksToDelete.map(track => track._id) } });
           console.log(`Deleted ${tracksToDelete.length} tracks that had no purchases`);
       }
       
       // For tracks that have been purchased, just remove them from public listings
       // but keep them in the database for purchased users to access
       const tracksToHide = userTracks.filter(track => purchasedTrackIds.has(track._id.toString()));
       if (tracksToHide.length > 0) {
           await BackingTrack.updateMany(
               { _id: { $in: tracksToHide.map(track => track._id) } },
               { $set: { isDeleted: true, deletedAt: new Date() } }
           );
           console.log(`Marked ${tracksToHide.length} purchased tracks as deleted but preserved for buyers`);
       }
   }   
   await User.findByIdAndDelete(req.userId);

   // Trigger frontend revalidation to clear cached data
   try {
       const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
       await fetch(`${frontendUrl}/api/revalidate`, {
           method: 'POST',
           headers: {
               'Content-Type': 'application/json',
           },
           body: JSON.stringify({ 
               secret: process.env.REVALIDATION_SECRET || 'default-secret',
               paths: ['/'] // Revalidate homepage and featured tracks
           })
       });
       console.log('Frontend revalidation triggered after account deletion');
   } catch (revalidationError) {
       console.error('Failed to trigger frontend revalidation:', revalidationError);
       // Don't fail the account deletion if revalidation fails
   }

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

        // Only select essential user profile fields - no track population for profile overview
        const user = await User.findById(req.userId).select('-password -purchasedTracks -uploadedTracks'); //exclude password and track arrays for security and performance

        if (! user){


            return res.status(404).json({message: "User not found"});
        }

        // Add minimal track counts only (no full track data)
        const [purchasedCount, uploadedCount] = await Promise.all([
            User.aggregate([
                { $match: { _id: user._id } },
                { $project: { purchasedCount: { $size: { $ifNull: ["$purchasedTracks", []] } } } }
            ]),
            User.aggregate([
                { $match: { _id: user._id } },
                { $project: { uploadedCount: { $size: { $ifNull: ["$uploadedTracks", []] } } } }
            ])
        ]);

        const userWithCounts = {
            ...user.toJSON({
                viewerRole: user.role,
                viewerId: req.userId
            }),
            purchasedTracksCount: purchasedCount[0]?.purchasedCount || 0,
            uploadedTracksCount: uploadedCount[0]?.uploadedCount || 0
        };

      return res.status(200).json({
  user: userWithCounts
});








    } catch(error){


        return res.status(500).json({message: "Internal server error"});



    }



}

// Update artist 'about' field... NOW DEPRECATED, USE updateProfile INSTEAD. left here for reference and compatibility purposes.
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
    const allowedFields = ['about', 'commissionPrice', 'availableForCommission', 'maxTimeTakenForCommission', 'artistInstrument'];
    const updates = allowedFields.reduce((acc, key) => {
      if (req.body[key] !== undefined) acc[key] = req.body[key];
      return acc;
    }, {});

    // If an avatar file was uploaded, set the avatar field to the S3 URL
    if (req.file && req.file.location) {
      updates.avatar = req.file.location;
    }
    // If avatar is explicitly set to empty string, remove avatar from user
    if (req.body.avatar === '') {
      updates.avatar = undefined;
    }

        //real defensive code here...
    if (req.body.availableForCommission !== undefined) {
      // Handle string conversion from FormData
      let boolValue;
      if (typeof req.body.availableForCommission === 'string') {
        boolValue = req.body.availableForCommission.toLowerCase() === 'true';
      } else if (typeof req.body.availableForCommission === 'boolean') {
        boolValue = req.body.availableForCommission;
      } else {
        return res.status(400).json({ message: 'Invalid value for availableForCommission.' });
      }
      updates.availableForCommission = boolValue;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update.' });
    }
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: 'User not found.' });
    if (user.role !== 'artist' && user.role !== 'admin') {
      return res.status(403).json({ message: 'Only artists or admins can update their profile.' });
    }    // Profanity and length check for 'about' using artistAboutSchema
    if (updates.about !== undefined) {
      const { error } = artistAboutSchema.validate({ about: updates.about });
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }
      const profanity = new Filter.Filter();
      if (profanity.isProfane(updates.about)) {
        return res.status(400).json({ message: 'Please avoid using inappropriate language in your about section.' });
      }
    }

    // Validation, profanity check, and sanitization for 'artistInstrument'
    if (updates.artistInstrument !== undefined) {
      // Sanitize input - trim whitespace and remove excessive spaces
      const sanitizedInstrument = updates.artistInstrument.toString().trim().replace(/\s+/g, ' ');
      
      // JOI validation
      const { error } = artistInstrumentSchema.validate({ artistInstrument: sanitizedInstrument });
      if (error) {
        return res.status(400).json({ message: error.details[0].message });
      }
      
      // Profanity check
      const profanity = new Filter.Filter();
      if (profanity.isProfane(sanitizedInstrument)) {
        return res.status(400).json({ message: 'Please avoid using inappropriate language in your instrument field.' });
      }
      
      // Use sanitized value
      updates.artistInstrument = sanitizedInstrument;
    }// Validate commissionPrice if present
    if (updates.commissionPrice !== undefined) {
      const price = Number(updates.commissionPrice);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ message: 'Commission price must be a non-negative number.' });
      }
      updates.commissionPrice = price;
      // Note: customerCommissionPrice will be auto-calculated by User model pre-save middleware
    }    // Validate maxTimeTakenForCommission if present
    if (updates.maxTimeTakenForCommission !== undefined) {
      if (typeof updates.maxTimeTakenForCommission !== 'string' || updates.maxTimeTakenForCommission.trim().length === 0) {
        return res.status(400).json({ message: 'Commission delivery time must be a non-empty string.' });
      }
      
      // Parse and validate minimum 7 days
      const timeString = updates.maxTimeTakenForCommission.trim();
      const timePattern = /^(\d+)\s+(days?|weeks?|months?)$/i;
      const match = timePattern.exec(timeString);
      
      if (!match) {
        return res.status(400).json({ message: 'Commission delivery time must be in format like "1 week", "2 weeks", "1 month", etc.' });
      }
      
      const amount = parseInt(match[1]);
      const unit = match[2].toLowerCase();
      
      // Convert to days for validation
      let totalDays = 0;
      if (unit.startsWith('day')) {
        totalDays = amount;
      } else if (unit.startsWith('week')) {
        totalDays = amount * 7;
      } else if (unit.startsWith('month')) {
        totalDays = amount * 30; // approximate
      }
      
      if (totalDays < 7) {
        return res.status(400).json({ message: 'Commission delivery time must be at least 7 days (1 week).' });
      }
      
      updates.maxTimeTakenForCommission = timeString;
    }
  
    // No need to validate avatar here, multer-s3 already does it

    Object.assign(user, updates);
    await user.save();
    // Ensure customerCommissionPrice is included in the response
    const userObj = user.toObject();
    userObj.customerCommissionPrice = user.customerCommissionPrice;
    return res.status(200).json({ message: 'Profile updated.', user: userObj });
  } catch (err) {
    console.error('Error in updateProfile:', err.stack || err);
    return res.status(500).json({ message: 'Failed to update profile.' });
  }
};

//simple function to get user role. 
export const getUserRole = async(req, res)  =>{

try {

  const user = await User.findById(req.userId);

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }


    return res.status(200).json({ user: user.role, message: "User details as follows" });


} catch (error) {
  console.error('Error in getUserRole:', error);
  return res.status(500).json({ message: 'Failed to get user role.' });
}

}


export const upgradeToArtist = async (req, res) => {

  try {
    const { about, commissionPrice } = req.body;

    // Validate required about section for artists
    if (about === undefined || about === null || about === '') {
      return res.status(400).json({ message: "About section is required for artists." });
    }

    // Validate about section using Joi schema
    const { error } = artistAboutSchema.validate({ about });
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    // Profanity filtering for about section
    const profanity = new Filter.Filter();
    if (profanity.isProfane(about)) {
      return res.status(400).json({ message: "Vulgar language detected. Please use nice words." });
    }

    // Validate about section length and type
    if (typeof about !== 'string' || about.length > 1000) {
      return res.status(400).json({ message: "About section must be a string and less than 1000 characters." });
    }

    // Validate commission price if provided
    if (commissionPrice !== undefined) {
      const price = Number(commissionPrice);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ message: 'Commission price must be a non-negative number.' });
      }
    }

    let avatar = req.body.avatar;
    // Use avatarUpload middleware: req.file.location will be set if avatar uploaded
    if (req.file && req.file.location) {
      avatar = req.file.location;
    }    // Validate avatar (must be a valid image URL) if provided and not uploaded
    if (avatar !== undefined && !req.file) {
      const urlPattern = /^(https?:\/\/)[^\s]+\.(jpg|jpeg|png|gif|webp)$/i;
      if (typeof avatar !== 'string' || !urlPattern.test(avatar)) {
        return res.status(400).json({ message: 'Avatar must be a valid image URL (jpg, jpeg, png, gif, webp).' });
      }
    }

    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (user.role !== 'user') {
      return res.status(400).json({ message: 'User is not a regular user.' });
    }

    // Update user to artist role with pending approval status
    user.role = 'artist';
    user.about = about;
    user.commissionPrice = commissionPrice || 0;
    user.profileStatus = 'pending'; // Set to pending for admin approval
    
    // Set avatar if provided
    if (avatar !== undefined) {
      user.avatar = avatar;
    }

    await user.save();

    return res.status(200).json({ 
      message: 'User upgraded to artist role. Your profile is pending admin approval.', 
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        about: user.about,
        commissionPrice: user.commissionPrice,
        profileStatus: user.profileStatus,
        avatar: user.avatar
      }
    });

  } catch (error) {
    console.error('Error in upgradeToArtist:', error);
    return res.status(500).json({ message: 'Failed to upgrade user role.' });
  }

}




