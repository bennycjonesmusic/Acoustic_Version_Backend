import fs from 'fs';
import { S3Client, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'; //going to use in register as well, to authenticate email
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import * as Filter from 'bad-words'; //package to prevent profanity
import zxcvbn from 'zxcvbn'; //package for password strength
import { validateEmail } from '../utils/emailValidator.js';
import { sendVerificationEmail } from '../utils/emailAuthentication.js';





export const searchUserByName = async (req, res) => {

try {
//using this so wont throw error if not logged in :) still want to function as a public route
    let searcher = null;
    if (req.userId) {
      searcher = await User.findById(req.userId);
    }

const {query, page = 1} = req.query; //destructure query and page from req.query
 
if (! query){

    return res.status(400).json({message: "Search query is required"}); //if no query prompt to add query

}

   


   const limit = 10;
    const skip = (page - 1) * limit;

     let users = await User.find({$text: {$search : query}}).sort({score: {$meta: 'textScore'}})
        .skip(skip).limit(limit).select({ score: { $meta: 'textScore' } }); 

         if (!users.length) {
      users = await User.find({
        username: { $regex: query, $options: 'i' }
      })
        .skip(skip)
        .limit(limit);
    }

        // Only return summary info for each user
        const summaryUsers = users.map(user => ({
            id: user._id,
            username: user.username,
            avatar: user.avatar, // if you have an avatar field
            // add any other summary fields you want
        }))

         return res.status(200).json({ users: summaryUsers });
        

    }

catch (error) {
    console.error('Error searching user by name:', error);
    return res.status(500).json({ message: "Internal server error" });
}


}

export const getUserDetails = async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        // Use schema transform with viewerRole/viewerId if available
        return res.status(200).json(user.toJSON({
            viewerRole: req.user?.role || 'public',
            viewerId: req.userId || null
        }));
    } catch (error) {
        console.error('Error getting user details:', error);
        return res.status(500).json({ message: "Internal server error" });
    }
};