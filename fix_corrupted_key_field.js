import mongoose from 'mongoose';
import BackingTrack from './models/backing_track.js';

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/backing-tracks');
    console.log('MongoDB connected successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const fixCorruptedKeyFields = async () => {
  try {
    await connectDB();

    // Find tracks with corrupted key fields (objects instead of strings)
    const corruptedTracks = await BackingTrack.find({
      $or: [
        { key: { $type: 'object' } },
        { key: { enum: { $exists: true } } }
      ]
    });

    console.log(`Found ${corruptedTracks.length} tracks with corrupted key fields`);

    for (const track of corruptedTracks) {
      console.log(`Fixing track: ${track.title} (ID: ${track._id})`);
      console.log(`Current corrupted key value:`, track.key);
      
      // Remove the corrupted key field (set to undefined)
      await BackingTrack.updateOne(
        { _id: track._id },
        { $unset: { key: 1 } }
      );
      
      console.log(`✅ Fixed track: ${track.title}`);
    }

    // Also check for any other problematic key values
    const allTracks = await BackingTrack.find({});
    console.log(`\nChecking all ${allTracks.length} tracks for key field issues...`);
    
    for (const track of allTracks) {
      if (track.key && typeof track.key !== 'string') {
        console.log(`⚠️  Found non-string key in track ${track.title} (${track._id}):`, track.key);
        await BackingTrack.updateOne(
          { _id: track._id },
          { $unset: { key: 1 } }
        );
        console.log(`✅ Fixed non-string key in track: ${track.title}`);
      }
    }

    console.log('\n🎉 All corrupted key fields have been fixed!');
    
  } catch (error) {
    console.error('Error fixing corrupted key fields:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected');
  }
};

// Run the fix
fixCorruptedKeyFields();
