import mongoose from 'mongoose';
import User from '../models/User.js';
import { S3Client, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_BUCKET_NAME;
const AVATAR_PREFIX = 'avatars/';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/backing_tracks');
  // 1. Get all avatar URLs in use
  const users = await User.find({ avatar: { $exists: true, $ne: null } }, 'avatar');
  const usedKeys = new Set();
  for (const user of users) {
    if (user.avatar && typeof user.avatar === 'string') {
      // Extract S3 key from URL (works for both public and signed URLs)
      const match = user.avatar.match(/avatars\/[\w\d\-_\.]+/);
      if (match) usedKeys.add(match[0]);
    }
  }

  // 2. List all objects in avatars/
  let toDelete = [];
  let ContinuationToken = undefined;
  do {
    const resp = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: AVATAR_PREFIX,
      ContinuationToken,
    }));
    for (const obj of resp.Contents || []) {
      if (!usedKeys.has(obj.Key)) {
        toDelete.push(obj.Key);
      }
    }
    ContinuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (ContinuationToken);

  // 3. Delete unused avatars
  for (const key of toDelete) {
    console.log('Deleting unused avatar:', key);
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  }
  console.log('Done. Deleted', toDelete.length, 'unused avatars.');
  await mongoose.disconnect();
}

main().catch(e => {
  console.error('Error deleting unused avatars:', e);
  process.exit(1);
});
