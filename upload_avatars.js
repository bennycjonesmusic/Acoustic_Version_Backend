import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import User from './models/User.js';

// AWS S3 configuration
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

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

// Avatar mappings
const avatarMappings = [
  {
    username: 'sarahandbenduo',
    filename: 'Sarahandbenduo.jpg'
  },
  {
    username: 'bennycjonesmusic',
    filename: 'bennycjonesmusiclogo.jpg'
  },
  {
    username: 'bespokeacousticguitar',
    filename: 'bespokeacousticguitarbackingtracks.jpg'
  }
];

async function uploadFileToS3(filePath, key) {
  const fileContent = fs.readFileSync(filePath);
  
  const params = {
    Bucket: BUCKET_NAME,
    Key: key,
    Body: fileContent,
    ContentType: getContentType(filePath),
    ACL: 'public-read'
  };

  try {
    const result = await s3.upload(params).promise();
    return result.Location;
  } catch (error) {
    throw new Error(`Failed to upload ${key} to S3: ${error.message}`);
  }
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

async function uploadAvatars() {
  try {
    // Connect to MongoDB
    log('Connecting to MongoDB...', 'cyan');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    log('Connected to MongoDB successfully!', 'green');

    const testAssetsDir = path.join(__dirname, 'test-assets');
    
    // Check if test-assets directory exists
    if (!fs.existsSync(testAssetsDir)) {
      throw new Error('test-assets directory not found');
    }

    log('\n📸 Starting avatar upload process...', 'magenta');
    
    for (const mapping of avatarMappings) {
      const { username, filename } = mapping;
      const filePath = path.join(testAssetsDir, filename);
      
      log(`\n🎯 Processing ${username}...`, 'yellow');
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        log(`❌ Avatar file not found: ${filename}`, 'red');
        continue;
      }

      // Find user in database
      const user = await User.findOne({ username });
      if (!user) {
        log(`❌ User not found: ${username}`, 'red');
        continue;
      }

      // Generate unique key for S3
      const fileExtension = path.extname(filename);
      const s3Key = `avatars/${username}_${uuidv4()}${fileExtension}`;
      
      try {
        // Upload to S3
        log(`  📤 Uploading ${filename} to S3...`, 'cyan');
        const avatarUrl = await uploadFileToS3(filePath, s3Key);
        
        // Update user's avatar URL in database
        user.avatar = avatarUrl;
        await user.save();
        
        log(`  ✅ Avatar uploaded successfully!`, 'green');
        log(`  🔗 Avatar URL: ${avatarUrl}`, 'blue');
        
      } catch (error) {
        log(`  ❌ Failed to upload avatar for ${username}: ${error.message}`, 'red');
      }
    }

    log('\n🎉 Avatar upload process completed!', 'green');

    // Verify uploads by showing updated users
    log('\n📋 Updated user avatars:', 'cyan');
    for (const mapping of avatarMappings) {
      const user = await User.findOne({ username: mapping.username });
      if (user && user.avatar) {
        log(`  ✅ ${user.username}: ${user.avatar}`, 'green');
      } else {
        log(`  ❌ ${mapping.username}: No avatar set`, 'red');
      }
    }

  } catch (error) {
    log(`💥 Error: ${error.message}`, 'red');
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    log('\n📴 MongoDB connection closed.', 'yellow');
  }
}

// Run the script
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
  log('🚀 Avatar Upload Script Starting...', 'magenta');
  log('📁 Looking for avatar files in test-assets directory...', 'cyan');
  
  uploadAvatars().catch(error => {
    log(`💥 Unhandled error: ${error.message}`, 'red');
    process.exit(1);
  });
}

export { uploadAvatars };
