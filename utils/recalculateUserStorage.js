// utils/recalculateUserStorage.js
// Cron job to recalculate and update storageUsed for all users
// Run at server start and at regular intervals

import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js';
import dotenv from 'dotenv';
dotenv.config();

export async function recalculateAllUserStorage() {
  const BATCH_SIZE = 50;
  let skip = 0;
  let users;
  do {
    users = await User.find({}).skip(skip).limit(BATCH_SIZE);
    for (const user of users) {
      // Only fetch fileSize for this user's tracks
      const tracks = await BackingTrack.find({ user: user._id }, 'fileSize');
      const total = tracks.reduce((sum, t) => sum + (t.fileSize || 0), 0);
      user.storageUsed = total;
      await user.save();
    }
    skip += BATCH_SIZE;
  } while (users.length === BATCH_SIZE);
  console.log('User storage recalculation complete.');
}

// If run directly: node utils/recalculateUserStorage.js
if (import.meta.url === `file://${process.argv[1]}`) {
  recalculateAllUserStorage().catch(err => {
    console.error('Error recalculating user storage:', err);
    process.exit(1);
  });
}
