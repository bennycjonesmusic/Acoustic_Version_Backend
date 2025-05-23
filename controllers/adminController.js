import { S3Client, ListObjectsCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';

export const clearS3 = async (req, res) => {
    try {
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const listParams = {
            Bucket: process.env.AWS_BUCKET_NAME,
        };
        const data = await s3Client.send(new ListObjectsCommand(listParams));
        if (data.Contents && data.Contents.length > 0) {
            console.log("Deleting files from S3 bucket:", data.Contents);
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Delete: {
                    Objects: data.Contents.map((object) => ({ Key: object.Key })),
                },
            };
            await s3Client.send(new DeleteObjectsCommand(deleteParams));
            return res.status(200).json({ message: 'All files deleted from S3' });
        } else {
           return res.status(200).json({ message: 'No files to delete from S3' });
        }
    } catch (error) {
        console.error('Error clearing S3 bucket:', error);
       return res.status(500).json({ message: 'Error clearing S3', error: error.message });
    }
};

export const deleteAllUsers = async (req, res) => {
    // Require a special admin code for extra safety
    const adminCode = req.header('x-admin-code');
    if (!adminCode || adminCode !== process.env.ADMIN_DELETE_CODE) {
        return res.status(403).json({ message: 'Admin code required or incorrect.' });
    }
    try {
        // Delete all users
        const userResult = await User.deleteMany({});
        // Delete all tracks
        const trackResult = await BackingTrack.deleteMany({});
        // Clear S3
        const s3Client = new S3Client({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        });
        const listParams = { Bucket: process.env.AWS_BUCKET_NAME };
        const data = await s3Client.send(new ListObjectsCommand(listParams));
        let s3Message = 'No files to delete from S3';
        if (data.Contents && data.Contents.length > 0) {
            const deleteParams = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Delete: {
                    Objects: data.Contents.map((object) => ({ Key: object.Key })),
                },
            };
            await s3Client.send(new DeleteObjectsCommand(deleteParams));
            s3Message = 'All files deleted from S3';
        }
        return res.status(200).json({ 
            message: `${userResult.deletedCount} users and ${trackResult.deletedCount} tracks deleted. ${s3Message}` 
        });
    } catch (error) {
        console.error('Error deleting all users/tracks and clearing S3:', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};

export const getUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password -__v').populate('uploadedTracks', 'title fileUrl');
       return res.status(200).json(users);
    } catch (error) {
        console.error('Problem fetching users:', error);
       return res.status(500).json({ message: "Error getting users" });
    }
};

// Admin: Ban a user
export const banUser = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorized' });
    }
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    user.banned = true;
    await user.save();
    return res.status(200).json({ success: true, message: 'User banned.' });
  } catch (error) {
    console.error('Error banning user:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
