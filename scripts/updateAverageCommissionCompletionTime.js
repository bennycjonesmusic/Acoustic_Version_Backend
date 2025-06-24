// Script to update all users' averageCommissionCompletionTime in the database
// Usage: node scripts/updateAverageCommissionCompletionTime.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import User from '../models/User.js';
import CommissionRequest from '../models/CommissionRequest.js'; // Ensure CommissionRequest model is registered

async function updateAllUsersAverageCommissionCompletionTime() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    const users = await User.find({});
    console.log(`Found ${users.length} users.`);

    let updatedCount = 0;
    for (const user of users) {
      if (typeof user.calculateAverageCommissionCompletionTime === 'function') {
        await user.calculateAverageCommissionCompletionTime();
        updatedCount++;
        console.log(`Updated user: ${user.username}`);
      }
    }
    console.log(`Updated averageCommissionCompletionTime for ${updatedCount} users.`);
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('Error updating users:', error);
    process.exit(1);
  }
}

updateAllUsersAverageCommissionCompletionTime();
