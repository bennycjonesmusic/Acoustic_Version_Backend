#!/usr/bin/env node

/**
 * Script to force populate ALL backing tracks with key signatures
 * This will overwrite any existing key signatures
 */

import mongoose from 'mongoose';
import BackingTrack from './models/backing_track.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

// Function to force add key signatures to ALL tracks
const forceAddKeySignatures = async () => {
  try {
    console.log('🎵 Force updating ALL tracks with key signatures...');
    
    // Get all tracks
    const allTracks = await BackingTrack.find({});
    console.log(`📋 Found ${allTracks.length} total tracks`);

    if (allTracks.length === 0) {
      console.log('❌ No tracks found in database!');
      return;
    }

    // First, set all tracks to A# Major by default
    const defaultUpdate = await BackingTrack.updateMany(
      {}, // Match all tracks
      {
        $set: {
          key: 'A',
          isFlat: false,
          isSharp: true,
          isMajor: true,
          isMinor: false
        }
      }
    );

    console.log(`✅ Set ${defaultUpdate.modifiedCount} tracks to A# Major`);

    // Now add variety based on track characteristics
    console.log('🎨 Adding variety to key signatures...');

    // Update tracks with "ballad", "slow", "gentle" to C Major
    const cMajorUpdate = await BackingTrack.updateMany(
      { title: { $regex: /ballad|slow|gentle/i } },
      {
        $set: {
          key: 'C',
          isFlat: false,
          isSharp: false,
          isMajor: true,
          isMinor: false
        }
      }
    );
    console.log(`🎹 Updated ${cMajorUpdate.modifiedCount} tracks to C Major`);

    // Update tracks with "folk", "country", "acoustic" to G Major
    const gMajorUpdate = await BackingTrack.updateMany(
      { title: { $regex: /folk|country|acoustic/i } },
      {
        $set: {
          key: 'G',
          isFlat: false,
          isSharp: false,
          isMajor: true,
          isMinor: false
        }
      }
    );
    console.log(`🎸 Updated ${gMajorUpdate.modifiedCount} tracks to G Major`);

    // Update tracks with "rock", "upbeat", "fast" to D Major
    const dMajorUpdate = await BackingTrack.updateMany(
      { title: { $regex: /rock|upbeat|fast/i } },
      {
        $set: {
          key: 'D',
          isFlat: false,
          isSharp: false,
          isMajor: true,
          isMinor: false
        }
      }
    );
    console.log(`🤘 Updated ${dMajorUpdate.modifiedCount} tracks to D Major`);

    // Update tracks with "sad", "melancholy", "blues" to A Minor
    const aMinorUpdate = await BackingTrack.updateMany(
      { title: { $regex: /sad|melancholy|blues/i } },
      {
        $set: {
          key: 'A',
          isFlat: false,
          isSharp: false,
          isMajor: false,
          isMinor: true
        }
      }
    );
    console.log(`😢 Updated ${aMinorUpdate.modifiedCount} tracks to A Minor`);

    // Update tracks with "dark", "moody", "minor" to E Minor
    const eMinorUpdate = await BackingTrack.updateMany(
      { title: { $regex: /dark|moody|minor/i } },
      {
        $set: {
          key: 'E',
          isFlat: false,
          isSharp: false,
          isMajor: false,
          isMinor: true
        }
      }
    );
    console.log(`🌙 Updated ${eMinorUpdate.modifiedCount} tracks to E Minor`);

    // Get a summary of key signatures after update
    console.log('\n📊 Generating key signature summary...');
    const keySignatureSummary = await BackingTrack.aggregate([
      {
        $group: {
          _id: {
            key: '$key',
            isFlat: '$isFlat',
            isSharp: '$isSharp',
            isMajor: '$isMajor',
            isMinor: '$isMinor'
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    console.log('\n🎼 Final Key Signature Distribution:');
    keySignatureSummary.forEach(item => {
      const { key, isFlat, isSharp, isMajor, isMinor } = item._id;
      let keyString = key || 'Unknown';
      if (isFlat) keyString += '♭';
      if (isSharp) keyString += '♯';
      if (isMajor) keyString += ' Major';
      if (isMinor) keyString += ' Minor';
      console.log(`  ${keyString}: ${item.count} tracks`);
    });

    // Verify by checking a few individual tracks
    console.log('\n🔍 Verifying with sample tracks...');
    const sampleTracks = await BackingTrack.find({}).limit(3);
    sampleTracks.forEach(track => {
      let keyString = track.key || 'No Key';
      if (track.isFlat) keyString += '♭';
      if (track.isSharp) keyString += '♯';
      if (track.isMajor) keyString += ' Major';
      if (track.isMinor) keyString += ' Minor';
      console.log(`  "${track.title}" -> ${keyString}`);
    });

  } catch (error) {
    console.error('❌ Error force updating key signatures:', error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await forceAddKeySignatures();
    console.log('\n🎉 Force key signature population completed successfully!');
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('👋 Database connection closed');
  }
};

// Run the script
main();
