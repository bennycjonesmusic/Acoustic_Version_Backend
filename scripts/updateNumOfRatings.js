import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import User from '../models/User.js';
import BackingTrack from '../models/backing_track.js'; // Register BackingTrack model

async function updateAllUsersNumOfRatings() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const users = await User.find({});
  for (const user of users) {
    await user.calculateNumOfRatings();
    console.log(`Updated numOfRatings for user ${user.username} (${user._id})`);
  }

  await mongoose.disconnect();
  console.log('All users updated!');
}

updateAllUsersNumOfRatings().catch(err => {
  console.error('Error updating users:', err);
  process.exit(1);
});
