// register_artists.js
// Script to register specific artists/admins for the music platform
// Usage: node register_artists.js

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from './models/User.js';
import * as Filter from 'bad-words';
import zxcvbn from 'zxcvbn';
import { validateEmail } from './utils/emailValidator.js';
import { sendVerificationEmail } from './utils/emailAuthentication.js';
import { registerSchema } from './controllers/validationSchemas.js';
import adminEmails from './utils/admins.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/backing-tracks';

// Artists/Admins to register
const ARTISTS_TO_REGISTER = [
  {
    username: 'Sarahandbenduo',
    email: 'sarahandbenduo@gmail.com',
    password: 'Moobslikejabba123456',
    role: 'artist',
    about: 'Sarah and Ben Duo - Professional acoustic musicians creating beautiful backing tracks'
  },
  {
    username: 'Bennycjonesmusic',
    email: 'bennycjonesmusic@gmail.com', 
    password: 'Moobslikejabba123456',
    role: 'artist',
    about: 'Benny C Jones Music - Creating quality acoustic guitar backing tracks'
  },
  {
    username: 'bespokeacousticguitar',
    email: 'bespokeacousticguitarbackingtracks@gmail.com',
    password: 'Moobslikejabba123456', 
    role: 'artist',
    about: 'Bespoke Acoustic Guitar Backing Tracks - Custom acoustic arrangements'
  }
];

// Color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function registerArtists() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    log('✅ Connected to MongoDB', 'green');

    log('\n🎨 Registering Artists/Admins...', 'magenta');
    log('================================', 'magenta');

    for (const artistData of ARTISTS_TO_REGISTER) {
      try {
        log(`\n📝 Processing: ${artistData.email}`, 'blue');

        // Check if user already exists
        const existingUser = await User.findOne({ 
          $or: [
            { email: artistData.email },
            { username: artistData.username }
          ]
        });

        if (existingUser) {
          log(`   ⚠️  User already exists (${existingUser.email})`, 'yellow');
          
          // Update role and profile status if needed
          let updated = false;
          if (existingUser.role !== artistData.role) {
            existingUser.role = artistData.role;
            updated = true;
          }
          if (existingUser.profileStatus !== 'approved') {
            existingUser.profileStatus = 'approved';
            updated = true;
          }
          if (existingUser.verified !== true) {
            existingUser.verified = true;
            updated = true;
          }

          if (updated) {
            await existingUser.save();
            log(`   ✅ Updated existing user (role: ${existingUser.role}, verified: ${existingUser.verified})`, 'green');
          } else {
            log(`   ℹ️  User already properly configured`, 'cyan');
          }
          continue;
        }        // Create new user following auth/register flow
        log(`   📝 Following auth/register validation flow...`, 'cyan');
        
        // 1. Validate with Joi schema
        const { error } = registerSchema.validate({
          username: artistData.username,
          email: artistData.email,
          password: artistData.password,
          role: artistData.role,
          about: artistData.about
        });
        if (error) {
          throw new Error(`Validation error: ${error.details[0].message}`);
        }

        // 2. Check profanity
        const profanity = new Filter.Filter();
        if (profanity.isProfane(artistData.username)) {
          throw new Error('Vulgar language detected in username');
        }
        if (profanity.isProfane(artistData.about)) {
          throw new Error('Vulgar language detected in about section');
        }

        // 3. Validate email
        const isEmailValid = await validateEmail(artistData.email);
        if (!isEmailValid) {
          throw new Error('Invalid email format');
        }

        // 4. Check password strength
        const passwordStrength = zxcvbn(artistData.password);
        if (passwordStrength.score < 3) {
          throw new Error('Password is too weak');
        }

        // 5. Hash password
        const hashedPassword = await bcrypt.hash(artistData.password, 10);

        // 6. Prepare user data following auth/register logic
        let userData = { 
          username: artistData.username, 
          email: artistData.email, 
          password: hashedPassword 
        };

        // Set role and profile status based on admin emails and role
        if (adminEmails.includes(artistData.email)) {
          userData.role = 'admin';
          userData.about = artistData.about;
          userData.profileStatus = 'approved';
          userData.commissionPrice = 25.00;
        } else if (artistData.role === 'artist') {
          userData = { 
            ...userData, 
            role: artistData.role, 
            about: artistData.about, 
            profileStatus: 'approved', // Pre-approve for initial setup
            commissionPrice: 25.00 
          };
        } else {
          userData.role = artistData.role;
          userData.profileStatus = 'approved';
        }

        // Add additional fields for our setup
        userData.verified = true; // Pre-verify these accounts
        userData.availableForCommission = true;

        const newUser = new User(userData);
        await newUser.save();

        // 7. Send verification email (optional for pre-verified accounts)
        try {
          const token = jwt.sign(
            { userId: newUser._id },
            process.env.EMAIL_VERIFICATION_SECRET,
            { expiresIn: '1d' }
          );
          // Note: Not sending email for automated setup, but token is generated
          log(`   📧 Verification token generated (not sent for automated setup)`, 'cyan');
        } catch (emailError) {
          log(`   ⚠️  Email token generation failed: ${emailError.message}`, 'yellow');
        }
        
        log(`   ✅ Created new user: ${newUser.username}`, 'green');
        log(`      Role: ${newUser.role}`, 'cyan');
        log(`      Email: ${newUser.email}`, 'cyan');
        log(`      Verified: ${newUser.verified}`, 'cyan');
        log(`      Profile Status: ${newUser.profileStatus}`, 'cyan');

      } catch (error) {
        log(`   ❌ Error processing ${artistData.email}: ${error.message}`, 'red');
        if (error.code === 11000) {
          log(`      Duplicate key error - user may already exist`, 'yellow');
        }
      }
    }

    // Summary
    log('\n📊 Registration Summary', 'blue');
    log('======================', 'blue');
    
    const totalUsers = await User.countDocuments();
    const totalArtists = await User.countDocuments({ role: { $in: ['artist', 'admin'] } });
    const approvedArtists = await User.countDocuments({ 
      role: { $in: ['artist', 'admin'] }, 
      profileStatus: 'approved' 
    });

    log(`Total users in database: ${totalUsers}`, 'cyan');
    log(`Total artists/admins: ${totalArtists}`, 'cyan');
    log(`Approved artists: ${approvedArtists}`, 'cyan');

    // List registered artists
    log('\n🎭 Registered Artists:', 'magenta');
    for (const artistData of ARTISTS_TO_REGISTER) {
      const user = await User.findOne({ email: artistData.email });
      if (user) {
        log(`   • ${user.username} (${user.email}) - ${user.role}`, 'green');
      }
    }

    log('\n🎉 Artist registration process completed!', 'green');

  } catch (error) {
    log(`\n❌ Registration failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    log('🔌 Disconnected from MongoDB', 'blue');
  }
}

// Handle cleanup on exit
process.on('SIGINT', async () => {
  log('\n\n⏹️  Script interrupted by user', 'yellow');
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
    log('🔌 MongoDB disconnected', 'blue');
  }
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  log('💥 Unhandled Rejection at:', 'red');
  console.log(promise);
  log('Reason:', 'red');
  console.log(reason);
  process.exit(1);
});

// Run the registration
registerArtists();
