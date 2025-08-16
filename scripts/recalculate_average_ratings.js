import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import User from './models/User.js';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function recalculateAllAverageRatings() {
  try {
    log('🔗 Connecting to MongoDB...', 'blue');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    log('✅ Connected to MongoDB', 'green');

    // Find all artists and admins (only they have tracks)
    const users = await User.find({ 
      role: { $in: ['artist', 'admin'] }
    });

    log(`📊 Found ${users.length} artists/admins to process`, 'cyan');

    let processed = 0;
    let updated = 0;

    for (const user of users) {
      const oldRating = user.averageTrackRating;
      
      // Call the calculateAverageTrackRating method
      await user.calculateAverageTrackRating();
      
      const newRating = user.averageTrackRating;
      
      if (oldRating !== newRating) {
        log(`🔄 ${user.username}: ${oldRating} → ${newRating}`, 'yellow');
        updated++;
      } else {
        log(`✓ ${user.username}: ${newRating} (unchanged)`, 'blue');
      }
      
      processed++;
    }

    log('\n📈 Recalculation Summary:', 'cyan');
    log(`   👥 Total users processed: ${processed}`, 'blue');
    log(`   🔄 Users updated: ${updated}`, updated > 0 ? 'yellow' : 'green');
    log(`   ✅ Users unchanged: ${processed - updated}`, 'green');

  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    console.error(error);
  } finally {
    await mongoose.disconnect();
    log('🔐 Disconnected from MongoDB', 'blue');
  }
}

// Run the script
recalculateAllAverageRatings().then(() => {
  log('🎉 Script completed!', 'green');
  process.exit(0);
}).catch(error => {
  log(`💥 Script failed: ${error.message}`, 'red');
  process.exit(1);
});
