// migrate_update_commission_time.js

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import CommissionRequest from './models/CommissionRequest.js';
import User from './models/User.js';

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });

  const artists = await User.find({ role: 'artist' });
  console.log(`Found ${artists.length} artists.`);

  let updated = 0;
  for (const artist of artists) {
    try {
      await artist.calculateAverageCommissionCompletionTime();
      updated++;
      console.log(`Updated artist: ${artist.username} (${artist._id})`);
    } catch (err) {
      console.error(`Failed to update artist: ${artist.username} (${artist._id})`, err);
    }
  }

  console.log(`Migration complete. Updated ${updated} artists.`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
