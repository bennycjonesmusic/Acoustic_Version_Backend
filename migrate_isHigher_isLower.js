import mongoose from 'mongoose';
import BackingTrack from './models/backing_track.js'; // Adjust path if needed
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/YOUR_DB_NAME';

async function migrate() {
  await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  // Set isHigher to false where missing
  const res1 = await BackingTrack.updateMany(
    { isHigher: { $exists: false } },
    { $set: { isHigher: false } }
  );
  console.log('isHigher migration result:', res1);

  // Set isLower to false where missing
  const res2 = await BackingTrack.updateMany(
    { isLower: { $exists: false } },
    { $set: { isLower: false } }
  );
  console.log('isLower migration result:', res2);

  await mongoose.disconnect();
  console.log('Migration complete!');
}

migrate().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});