import fs from 'fs';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken'; //going to use in register as well, to authenticate email
import User from '../models/User.js';
import backingTrack from '../models/backing_track.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import * as Filter from 'bad-words'; //package to prevent profanity
import zxcvbn from 'zxcvbn'; //package for password strength
import { validateEmail } from '../utils/emailValidator.js';
import { sendVerificationEmail } from '../utils/emailAuthentication.js';
export const register = async (req, res) => {
    try {
        const { username, email, password, role = "user" } = req.body;
        const existingUser = await User.findOne({ $or: [ {email } , { username } ] });
        if (existingUser) {
            return res.status(400).json({ message: "User already exists!" });
        }

        const profanity = new Filter.Filter();
        
        if (profanity.isProfane(username)){

            return res.status(400).json({message: "Vulgar language detected. Please use nice words."})

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
        const newUser = new User({ username, email, password: hashedPassword });
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

export const login = async (req, res) => {
    try {
        const { login, password } = req.body;
        const user = await User.findOne({$or: [{email: login}, {username: login}]});
        if (!user) {
            return res.status(400).json({ message: "Invalid email or password" });
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

export const uploadTrack = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        const fileStream = fs.createReadStream(req.file.path);
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const uploadParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: `songs/${Date.now()}-${req.file.originalname}`,
            Body: fileStream,
            ACL: 'private',
        };
        const data = await new Upload({
            client: s3Client,
            params: uploadParams,
        }).done();
        const newTrack = new backingTrack({
            title: req.body.title || req.file.originalname,
            description: req.body.description || 'No description provided',
            fileUrl: data.Location,
            s3Key: uploadParams.Key,
            price: parseFloat(req.body.price) || 0,
            user: req.userId,
        });
        await newTrack.save();
        const updateUser = await User.findByIdAndUpdate(req.userId, { $push: { uploadedTracks: newTrack._id } }, { new: true });
        if (!updateUser) {
            return res.status(404).json({ message: "User not found." });
        }
        fs.unlinkSync(req.file.path);
        res.status(200).json({ message: 'File uploaded successfully!', track: newTrack });
    } catch (error) {
        console.error('Error uploading backing track:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const deleteTrack = async (req, res) => {
    try {
        const Track = await backingTrack.findById(req.params.id);
        if (!Track) {
            return res.status(404).json({ message: "Track not found." });
        }
        if (Track.user.toString() !== req.userId) {
            return res.status(403).json({ message: "You are not authorized to delete this track." });
        }
        if (!Track.s3Key) {
            return res.status(400).json({ message: "Track does not have an associated s3Key." });
        }
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const deleteParameters = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: Track.s3Key,
        };
        await User.findByIdAndUpdate(req.userId, { $pull: { uploadedTracks: req.params.id } }, { new: true });
        await s3Client.send(new DeleteObjectCommand(deleteParameters));
        await backingTrack.findByIdAndDelete(req.params.id);
        res.status(200).json({ message: 'Track and file deleted' });
    } catch (error) {
        console.error('There was an error deleting track:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getTracks = async (req, res) => {
    try {
        const tracks = await backingTrack.find({ user: req.userId }).sort({ createdAt: -1 });
        res.status(200).json(tracks);
    } catch (error) {
        console.error('Error fetching tracks:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateS3Key = async (req, res) => {
    try {
        const track = await backingTrack.findById(req.params.id);
        if (!track) {
            return res.status(404).json({ message: "Track not found." });
        }
        if (track.user.toString() !== req.userId) {
            return res.status(403).json({ message: "You are not authorized to update this track." });
        }
        const updatedTrack = await backingTrack.findByIdAndUpdate(
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

export const downloadTrack = async (req, res) => {

try {

    const track = await backingTrack.findById(req.params.id);
    if (!track) {
        return res.status(404).json({message: "Track not found."});
    }

    const userId = req.userId;

    const user = await User.findById(userId); //find the user wanting to download track

    const hasBought = user.boughtTracks.some(id => id.equals(track._id)); //had to use .some so we can access the .equals method. .includes used strict equality === which is not correct here.
    const hasUploaded = user.uploadedTracks.some(id => id.equals(track._id));

    if (!hasBought && !hasUploaded){
    
        return res.status(403).json({message: "You are not allowed to download this track. Please purchase"})
    }


     const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });

          const createParameters = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: track.s3Key,
        };

        const command = new GetObjectCommand(createParameters);
        const data = await s3Client.send(command);
        track.downloadCount += 1;
        await track.save();

        res.setHeader('Content-Type', data.ContentType);
res.setHeader('Content-Disposition', `attachment; filename="${track.title}"`);

data.Body.pipe(res);

    
} catch (error) {

    console.error('Error downloading track:', error);
    res.status(500).json({ message: 'Internal server error' });



}





}
