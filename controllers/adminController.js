import { S3Client, ListObjectsCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import User from '../models/User.js';

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
            res.status(200).json({ message: 'All files deleted from S3' });
        } else {
            res.status(200).json({ message: 'No files to delete from S3' });
        }
    } catch (error) {
        console.error('Error clearing S3 bucket:', error);
        res.status(500).json({ message: 'Error clearing S3', error: error.message });
    }
};

export const deleteAllUsers = async (req, res) => {
    try {
        const result = await User.deleteMany({});
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'No users found to delete' });
        }
        res.status(200).json({ message: `${result.deletedCount} users deleted` });
    } catch (error) {
        console.error('Error deleting all users:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getUsers = async (req, res) => {
    try {
        const users = await User.find().select('-password -__v').populate('uploadedTracks', 'title fileUrl');
        res.status(200).json(users);
    } catch (error) {
        console.error('Problem fetching users:', error);
        res.status(500).json({ message: "Error getting users" });
    }
};
