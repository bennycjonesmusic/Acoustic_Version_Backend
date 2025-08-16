import mongoose from 'mongoose';
import BackingTrack from './models/backing_track.js';

const fixCorruptedKeyFields = async () => {
  try {
    console.log('Using existing MongoDB connection...');

    // First, let's check the specific problematic track by ID
    const problematicTrackId = '684094db887f8c96def62e0b';
    console.log(`\nChecking specific track: ${problematicTrackId}`);
    
    // Use raw MongoDB operations to bypass Mongoose validation
    const db = mongoose.connection.db;
    const collection = db.collection('backingtracks');
    
    // Find the specific track using raw query
    const specificTrack = await collection.findOne({ _id: new mongoose.Types.ObjectId(problematicTrackId) });
    
    if (specificTrack) {
      console.log(`Found track: ${specificTrack.title}`);
      console.log(`Current key value:`, specificTrack.key);
      console.log(`Key type:`, typeof specificTrack.key);
      
      if (specificTrack.key && typeof specificTrack.key === 'object') {
        console.log('🔧 Fixing corrupted key field for specific track...');
        await collection.updateOne(
          { _id: new mongoose.Types.ObjectId(problematicTrackId) },
          { $unset: { key: 1 } }
        );
        console.log(`✅ Fixed corrupted key in track: ${specificTrack.title}`);
      } else {
        console.log('Key field appears to be OK for this track');
      }
    } else {
      console.log('Specific track not found');
    }

    // Now find all tracks with corrupted key fields using raw MongoDB operations
    console.log('\nSearching for all tracks with corrupted key fields...');
    
    const corruptedTracks = await collection.find({
      $or: [
        { "key.enum": { $exists: true } },
        { key: { $type: "object" } },
        { key: { $ne: null, $not: { $type: "string" } } }
      ]
    }).toArray();

    console.log(`Found ${corruptedTracks.length} tracks with corrupted key fields using raw query`);

    for (const track of corruptedTracks) {
      console.log(`\nFixing track: ${track.title} (ID: ${track._id})`);
      console.log(`Current corrupted key value:`, track.key);
      console.log(`Key type:`, typeof track.key);
      
      // Remove the corrupted key field
      await collection.updateOne(
        { _id: track._id },
        { $unset: { key: 1 } }
      );
      
      console.log(`✅ Fixed track: ${track.title}`);
    }

    // Also check all tracks for any non-string key values
    console.log('\nChecking all tracks for non-string key values...');
    const allTracks = await collection.find({}).toArray();
    console.log(`Checking ${allTracks.length} total tracks...`);
    
    let fixedCount = 0;
    for (const track of allTracks) {
      if (track.key !== undefined && track.key !== null && typeof track.key !== 'string') {
        console.log(`⚠️  Found non-string key in track ${track.title} (${track._id}):`, track.key);
        await collection.updateOne(
          { _id: track._id },
          { $unset: { key: 1 } }
        );
        console.log(`✅ Fixed non-string key in track: ${track.title}`);
        fixedCount++;
      }
    }

    console.log(`\n🎉 Fixed ${fixedCount} additional tracks with non-string key values!`);
    console.log('All corrupted key fields have been cleaned up!');
    
  } catch (error) {
    console.error('Error fixing corrupted key fields:', error);
  }
};

// Run the fix
fixCorruptedKeyFields();
