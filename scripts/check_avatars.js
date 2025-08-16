import mongoose from 'mongoose';
import User from './models/User.js';
import dotenv from 'dotenv';
dotenv.config();

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function checkAvatars() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    log('✅ Connected to MongoDB', 'green');
    
    log('\n🔍 Checking for avatar data...', 'yellow');
    
    const users = await User.find({}).select('username email avatar');
    
    log(`\n📊 Found ${users.length} users total`, 'blue');
    
    let usersWithAvatars = 0;
    let usersWithoutAvatars = 0;
    
    for (const user of users) {
      if (user.avatar) {
        usersWithAvatars++;
        log(`✅ ${user.username} HAS avatar: ${user.avatar}`, 'green');
      } else {
        usersWithoutAvatars++;
        log(`❌ ${user.username} NO avatar`, 'red');
      }
    }
    
    log(`\n📈 Summary:`, 'cyan');
    log(`   Users with avatars: ${usersWithAvatars}`, usersWithAvatars > 0 ? 'green' : 'yellow');
    log(`   Users without avatars: ${usersWithoutAvatars}`, usersWithoutAvatars > 0 ? 'red' : 'green');
    
    if (usersWithAvatars === 0) {
      log('\n💡 SOLUTION: Your users have no avatars uploaded yet!', 'yellow');
      log('   This is why your bucket policy appears to not be working.', 'yellow');
      log('   You need to upload some avatars first to test the policy.', 'yellow');
      log('\n🚀 To upload avatars, run:', 'cyan');
      log('   node upload_avatars_via_api.js', 'cyan');
    }
    
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
  } finally {
    await mongoose.disconnect();
    log('\n✅ Disconnected from MongoDB', 'green');
  }
}

checkAvatars();
