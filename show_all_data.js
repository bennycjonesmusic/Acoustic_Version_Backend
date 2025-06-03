// Script to show all tracks and users in the database
// Usage: node show_all_data.js

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import User from './models/User.js';
import BackingTrack from './models/backing_track.js';

dotenv.config();

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function showAllData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    log('✅ Connected to MongoDB', 'green');

    // Get all users
    const users = await User.find({})
      .select('username email role profileStatus uploadedTracks purchasedTracks createdAt')
      .populate('uploadedTracks', 'title createdAt price')
      .populate('purchasedTracks.track', 'title price');

    // Get all tracks
    const tracks = await BackingTrack.find({})
      .populate('user', 'username email')
      .sort({ createdAt: -1 });

    log('\n=== DATABASE SUMMARY ===', 'cyan');
    log(`📊 Total Users: ${users.length}`, 'blue');
    log(`🎵 Total Tracks: ${tracks.length}`, 'blue');

    // Show users by role
    const usersByRole = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    log('\n=== USERS BY ROLE ===', 'cyan');
    Object.entries(usersByRole).forEach(([role, count]) => {
      log(`${role}: ${count}`, 'yellow');
    });

    // Show user details
    log('\n=== ALL USERS ===', 'cyan');
    users.forEach((user, index) => {
      log(`\n${index + 1}. ${user.username} (${user.email})`, 'green');
      log(`   Role: ${user.role} | Status: ${user.profileStatus || 'N/A'}`, 'blue');
      log(`   Created: ${user.createdAt?.toDateString() || 'N/A'}`, 'blue');
      log(`   Uploaded Tracks: ${user.uploadedTracks?.length || 0}`, 'blue');
      log(`   Purchased Tracks: ${user.purchasedTracks?.length || 0}`, 'blue');
      
      if (user.uploadedTracks?.length > 0) {
        log(`   📤 Uploaded:`, 'magenta');
        user.uploadedTracks.forEach(track => {
          log(`      - "${track.title}" ($${track.price}) - ${track.createdAt?.toDateString()}`, 'magenta');
        });
      }

      if (user.purchasedTracks?.length > 0) {
        log(`   💰 Purchased:`, 'yellow');
        user.purchasedTracks.forEach(p => {
          if (p.track) {
            log(`      - "${p.track.title}" ($${p.track.price}) - ${p.purchasedAt?.toDateString()}`, 'yellow');
          }
        });
      }
    });

    // Show track details
    log('\n=== ALL TRACKS ===', 'cyan');
    tracks.forEach((track, index) => {
      log(`\n${index + 1}. "${track.title}" by ${track.user?.username || 'Unknown'}`, 'green');
      log(`   Artist: ${track.originalArtist || 'N/A'}`, 'blue');
      log(`   Price: $${track.price || 0}`, 'blue');
      log(`   Genre: ${track.genre || 'N/A'} | Type: ${track.backingTrackType || 'N/A'}`, 'blue');
      log(`   Private: ${track.isPrivate ? 'Yes' : 'No'}`, 'blue');
      log(`   Created: ${track.createdAt?.toDateString() || 'N/A'}`, 'blue');
      log(`   Rating: ${track.averageRating || 0}/5 | Purchases: ${track.purchaseCount || 0}`, 'blue');
      if (track.previewUrl) {
        log(`   Preview: ${track.previewUrl}`, 'cyan');
      }
      if (track.fileUrl) {
        log(`   File: ${track.fileUrl}`, 'cyan');
      }
    });

    // Show statistics
    const publicTracks = tracks.filter(t => !t.isPrivate);
    const privateTracks = tracks.filter(t => t.isPrivate);
    const totalRevenue = tracks.reduce((sum, track) => sum + ((track.purchaseCount || 0) * (track.price || 0)), 0);

    log('\n=== STATISTICS ===', 'cyan');
    log(`📊 Public Tracks: ${publicTracks.length}`, 'green');
    log(`🔒 Private Tracks: ${privateTracks.length}`, 'green');
    log(`💵 Total Revenue Generated: $${totalRevenue.toFixed(2)}`, 'green');
    log(`📈 Average Track Price: $${tracks.length > 0 ? (tracks.reduce((sum, t) => sum + (t.price || 0), 0) / tracks.length).toFixed(2) : 0}`, 'green');

    // Show recent activity
    const recentTracks = tracks.slice(0, 5);
    const recentUsers = users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

    log('\n=== RECENT ACTIVITY ===', 'cyan');
    log('🆕 Recent Tracks:', 'yellow');
    recentTracks.forEach((track, index) => {
      log(`   ${index + 1}. "${track.title}" by ${track.user?.username} - ${track.createdAt?.toDateString()}`, 'yellow');
    });

    log('\n👥 Recent Users:', 'yellow');
    recentUsers.forEach((user, index) => {
      log(`   ${index + 1}. ${user.username} (${user.role}) - ${user.createdAt?.toDateString()}`, 'yellow');
    });

  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    console.error(error);
  } finally {
    await mongoose.disconnect();
    log('\n✅ Disconnected from MongoDB', 'green');
  }
}

showAllData();