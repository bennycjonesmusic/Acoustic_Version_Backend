#!/usr/bin/env node

/**
 * Script to populate ALL backing tracks with key signatures using individual saves
 * This approach uses individual save() operations which seem to work better
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

// Function to determine key signature based on track title and genre
const determineKeySignature = (track) => {
  const title = track.title?.toLowerCase() || '';
  const genre = track.genre?.toLowerCase() || '';
  
  // Check title patterns for specific keys
  if (title.includes('ballad') || title.includes('slow') || title.includes('gentle')) {
    return { key: 'C', isFlat: false, isSharp: false, isMajor: true, isMinor: false };
  }
  
  if (title.includes('folk') || title.includes('country') || title.includes('acoustic') || genre === 'folk' || genre === 'country') {
    return { key: 'G', isFlat: false, isSharp: false, isMajor: true, isMinor: false };
  }
  
  if (title.includes('rock') || title.includes('upbeat') || title.includes('fast') || genre === 'rock') {
    return { key: 'D', isFlat: false, isSharp: false, isMajor: true, isMinor: false };
  }
  
  if (title.includes('sad') || title.includes('melancholy') || title.includes('blues')) {
    return { key: 'A', isFlat: false, isSharp: false, isMajor: false, isMinor: true };
  }
  
  if (title.includes('dark') || title.includes('moody') || title.includes('minor')) {
    return { key: 'E', isFlat: false, isSharp: false, isMajor: false, isMinor: true };
  }
  
  // Default to A# Major
  return { key: 'A', isFlat: false, isSharp: true, isMajor: true, isMinor: false };
};

// Function to populate key signatures using individual saves
const populateKeySignatures = async () => {
  try {
    console.log('🎵 Starting key signature population with individual saves...');
    
    // Get all tracks
    const allTracks = await BackingTrack.find({});
    console.log(`📋 Found ${allTracks.length} total tracks`);

    if (allTracks.length === 0) {
      console.log('❌ No tracks found in database!');
      return;
    }

    let updated = 0;
    let errors = 0;

    // Process each track individually
    for (let i = 0; i < allTracks.length; i++) {
      const track = allTracks[i];
      
      try {
        // Determine key signature for this track
        const keySignature = determineKeySignature(track);
        
        // Update the track
        track.key = keySignature.key;
        track.isFlat = keySignature.isFlat;
        track.isSharp = keySignature.isSharp;
        track.isMajor = keySignature.isMajor;
        track.isMinor = keySignature.isMinor;
        
        // Save the track
        await track.save();
        updated++;
        
        // Show progress every 10 tracks
        if ((i + 1) % 10 === 0 || i === allTracks.length - 1) {
          console.log(`📈 Progress: ${i + 1}/${allTracks.length} tracks processed`);
        }
        
      } catch (error) {
        console.error(`❌ Error updating track "${track.title}":`, error.message);
        errors++;
      }
    }

    console.log(`✅ Successfully updated ${updated} tracks`);
    if (errors > 0) {
      console.log(`⚠️  Failed to update ${errors} tracks`);
    }

    // Get a summary of key signatures after update
    console.log('\n📊 Generating key signature summary...');
    const keySignatureSummary = await BackingTrack.aggregate([
      {
        $match: {
          key: { $exists: true, $ne: null }
        }
      },
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

    // Verify by checking a few tracks with their new titles
    console.log('\n🔍 Sample tracks with key signatures:');
    const sampleTracks = await BackingTrack.find({}).limit(5);
    sampleTracks.forEach(track => {
      let keyString = track.key || 'No Key';
      if (track.isFlat) keyString += '♭';
      if (track.isSharp) keyString += '♯';
      if (track.isMajor) keyString += ' Major';
      if (track.isMinor) keyString += ' Minor';
      
      // Show what the title would look like with key signature
      const titleWithKey = keyString !== 'No Key' ? `${track.title} in ${keyString}` : track.title;
      console.log(`  "${titleWithKey}"`);
    });

  } catch (error) {
    console.error('❌ Error populating key signatures:', error);
    throw error;
  }
};

// Main execution
const main = async () => {
  try {
    await connectDB();
    await populateKeySignatures();
    console.log('\n🎉 Key signature population completed successfully!');
    console.log('🔄 Remember to restart your frontend to see the changes!');
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
