// Script to clear all purchased and bought tracks from all users
// Usage: node clear_user_tracks.js

import mongoose from 'mongoose';
import User from './models/User.js';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/backing-tracks';

async function clearTracks() {
  await mongoose.connect(MONGO_URI);
  const users = await User.find({});
  let updated = 0;
  for (const user of users) {
    let changed = false;
    if (Array.isArray(user.purchasedTracks) && user.purchasedTracks.length > 0) {
      user.purchasedTracks = [];
      changed = true;
    }
    if (Array.isArray(user.boughtTracks) && user.boughtTracks.length > 0) {
      user.boughtTracks = [];
      changed = true;
    }
    if (changed) {
      await user.save();
      updated++;
    }
  }
  await mongoose.disconnect();
  console.log(`Cleared tracks for ${updated} users.`);
}

clearTracks().catch(err => {
  console.error('Error clearing user tracks:', err);
  process.exit(1);
});
