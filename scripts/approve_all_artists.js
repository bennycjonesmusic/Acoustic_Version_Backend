// approve_all_artists.js
// Run this script to set all artists with profileStatus 'pending' or 'rejected' to 'approved'.

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import User from './models/User.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/backing-tracks', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  const result = await User.updateMany(
    { role: 'artist', profileStatus: { $in: ['pending', 'rejected'] } },
    { $set: { profileStatus: 'approved' } }
  );
  console.log(`Approved ${result.modifiedCount} artist(s).`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Error approving artists:', err);
  process.exit(1);
});
