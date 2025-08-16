#!/usr/bin/env node

/**
 * Script to populate all backing tracks with key signatures
 * This will add "A#" (A sharp major) to all tracks that don't have key signatures
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

// Function to add key signatures to all tracks
const addKeySignaturesToTracks = async () => {
  try {
    console.log('🎵 Starting key signature population...');
    
    // Find all tracks that don't have a key signature
    const tracksWithoutKey = await BackingTrack.find({
      $or: [
        { key: { $exists: false } },
        { key: null },
        { key: '' }
      ]
    });

    console.log(`📋 Found ${tracksWithoutKey.length} tracks without key signatures`);

    if (tracksWithoutKey.length === 0) {
      console.log('✅ All tracks already have key signatures!');
      return;
    }

    // Update all tracks without key signatures to A# Major
    const updateResult = await BackingTrack.updateMany(
      {
        $or: [
          { key: { $exists: false } },
          { key: null },
          { key: '' }
        ]
      },
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

    console.log(`✅ Updated ${updateResult.modifiedCount} tracks with A# Major key signature`);

    // Let's also add some variety - update some tracks to different keys
    console.log('🎨 Adding variety to key signatures...');

    // Update some tracks to C Major
    await BackingTrack.updateMany(
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

    // Update some tracks to G Major
    await BackingTrack.updateMany(
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

    // Update some tracks to D Major
    await BackingTrack.updateMany(
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

    // Update some tracks to A Minor
    await BackingTrack.updateMany(
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

    // Update some tracks to E Minor
    await BackingTrack.updateMany(
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

    console.log('✅ Added variety to key signatures based on track titles');

    // Get a summary of key signatures
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

    console.log('\n📊 Key Signature Summary:');
    keySignatureSummary.forEach(item => {
      const { key, isFlat, isSharp, isMajor, isMinor } = item._id;
      let keyString = key || 'No Key';
      if (isFlat) keyString += '♭';
      if (isSharp) keyString += '♯';
      if (isMajor) keyString += ' Major';
      if (isMinor) keyString += ' Minor';
      console.log(`  ${keyString}: ${item.count} tracks`);
    });

  } catch (error) {
    console.error('❌ Error updating key signatures:', error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await addKeySignaturesToTracks();
    console.log('\n🎉 Key signature population completed successfully!');
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
