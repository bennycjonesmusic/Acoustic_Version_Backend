import BackingTrack from "../models/backing_track.js";
import User from "../models/User.js";
import fs from 'fs'; // for reading & deleting temp files
import { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage'; // for streaming uploads to S3
import { pathToFileURL } from "url";



export async function deleteCron() {
    console.log('[DELETECRON] Starting cleanup of soft-deleted tracks...');

    //find tracks that are marked as deleted
const tracksToDelete = await BackingTrack.find({
    isDeleted: true
});

console.log(`[DELETECRON] Found ${tracksToDelete.length} soft-deleted tracks to examine`);

if (tracksToDelete.length === 0) {
    console.log('[DELETECRON] No soft-deleted tracks found, cleanup complete');
    return;
}

//find users who have purchased these tracks
const tracksPurchasedByUser = await User.find({
    purchasedTracks: { $elemMatch: { track: { $in: tracksToDelete.map(track => track._id || track.id) } } }
});

const purchasedTrackIds = new Set();

for (const user of tracksPurchasedByUser) {
    for (const purchasedTrack of user.purchasedTracks) {
        purchasedTrackIds.add(purchasedTrack.track.toString())
    }
}

console.log(`[DELETECRON] Found ${purchasedTrackIds.size} unique tracks still in users' purchased tracks`);

let deletedCount = 0;

for (const track of tracksToDelete) {
    const trackId = track._id || track.id;
    if (!purchasedTrackIds.has(trackId.toString())) {
        // Use the same S3 delete logic as in deleteTrack controller
        if (!track.s3Key) {
            console.error(`Track ${trackId} does not have an associated s3Key.`);
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
            };            try {
                await s3Client.send(new DeleteObjectCommand(deleteParameters));
            } catch (err) {
                console.error(`Error deleting S3 object for track ${trackId}:`, err);
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
                    console.error(`Error deleting preview from S3 for track ${trackId}:`, err);
                }
            }
        }        // Delete from DB
        await BackingTrack.findByIdAndDelete(trackId);
        
        // Decrement user's storageUsed by the deleted track's fileSize
        if (track.user && track.fileSize) {
            await User.findByIdAndUpdate(track.user, { $inc: { storageUsed: -Math.abs(track.fileSize) } });
        }
        
        console.log(`[DELETECRON] Permanently deleted track ${trackId} (${track.title}) from S3 and DB`);
        deletedCount++;
    } else {
        console.log(`[DELETECRON] Skipping track ${trackId} (${track.title}) - still purchased by users`);
    }
}

console.log(`[DELETECRON] Cleanup complete: ${deletedCount} tracks permanently deleted, ${tracksToDelete.length - deletedCount} tracks preserved for purchasers`);
}