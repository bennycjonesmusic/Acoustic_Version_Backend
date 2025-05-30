import BackingTrack from "../models/backing_track.js";
import User from "../models/User.js";
import fs from 'fs'; // for reading & deleting temp files
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage'; // for streaming uploads to S3
import { pathToFileURL } from "url";



export async function deleteCron() {

    //find tracks that are marked as deleted
const tracksToDelete = await BackingTrack.find({
    isDeleted: true

});

//find users who have purchased these tracks
const tracksPurchasedByUser = await User.find({
    purchasedTracks: { $elemMatch: { track: { $in: tracksToDelete.map(track => track._id) } } }
});

const purchasedTrackIds = new Set();

for (const user of tracksPurchasedByUser) 
    for (const purchasedTrack of user.purchasedTracks) {
        purchasedTrackIds.add(purchasedTrack.track.toString())
    }

for (const track of tracksToDelete) {
    if (!purchasedTrackIds.has(track._id.toString())) {
        // Use the same S3 delete logic as in deleteTrack controller
        if (!track.s3Key) {
            console.error(`Track ${track._id} does not have an associated s3Key.`);
        } else {
            const s3Client = new S3Client({
                region: process.env.AWS_REGION,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                },
            });
            const deleteParameters = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: track.s3Key,
            };
            try {
                await s3Client.send(new DeleteObjectCommand(deleteParameters));
            } catch (err) {
                console.error(`Error deleting S3 object for track ${track._id}:`, err);
            }
            // Delete preview from S3 if it exists
            if (track.previewUrl) {
                try {
                    // Extract the S3 key from the previewUrl
                    const url = new URL(track.previewUrl);
                    const keyMatch = url.pathname.match(/^\/?(.+)/);
                    const previewKey = keyMatch ? keyMatch[1] : null;
                    if (previewKey) {
                        await s3Client.send(new DeleteObjectCommand({
                            Bucket: process.env.AWS_BUCKET_NAME,
                            Key: previewKey,
                        }));
                    }
                } catch (err) {
                    console.error(`Error deleting preview from S3 for track ${track._id}:`, err);
                }
            }
        }
        // Delete from DB
        await BackingTrack.findByIdAndDelete(track._id);
        console.log(`Deleted track ${track._id} from S3 and DB`);
    }
}
}