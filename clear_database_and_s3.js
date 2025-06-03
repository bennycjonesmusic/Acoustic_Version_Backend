// clear_database_and_s3.js
// Comprehensive script to clear MongoDB data and S3 files
// Usage: node clear_database_and_s3.js [--confirm]

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

// Import all models
import User from './models/User.js';
import BackingTrack from './models/backing_track.js';
import CommissionRequest from './models/CommissionRequest.js';
import ContactForm from './models/contact_form.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/backing-tracks';

// S3 Configuration
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

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

async function clearMongoCollections() {
  log('\n🗑️  Clearing MongoDB Collections...', 'yellow');
  
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGO_URI);
    log('✅ Connected to MongoDB', 'green');

    // Get counts before deletion
    const userCount = await User.countDocuments();
    const trackCount = await BackingTrack.countDocuments();
    const commissionCount = await CommissionRequest.countDocuments();
    const contactCount = await ContactForm.countDocuments();

    log(`\n📊 Current document counts:`, 'blue');
    log(`   Users: ${userCount}`, 'cyan');
    log(`   Backing Tracks: ${trackCount}`, 'cyan');
    log(`   Commission Requests: ${commissionCount}`, 'cyan');
    log(`   Contact Forms: ${contactCount}`, 'cyan');

    // Clear all collections
    log('\n🧹 Deleting all documents...', 'yellow');
    
    const userResult = await User.deleteMany({});
    log(`   Deleted ${userResult.deletedCount} users`, 'green');

    const trackResult = await BackingTrack.deleteMany({});
    log(`   Deleted ${trackResult.deletedCount} backing tracks`, 'green');

    const commissionResult = await CommissionRequest.deleteMany({});
    log(`   Deleted ${commissionResult.deletedCount} commission requests`, 'green');

    const contactResult = await ContactForm.deleteMany({});
    log(`   Deleted ${contactResult.deletedCount} contact forms`, 'green');

    // Verify collections are empty
    const finalUserCount = await User.countDocuments();
    const finalTrackCount = await BackingTrack.countDocuments();
    const finalCommissionCount = await CommissionRequest.countDocuments();
    const finalContactCount = await ContactForm.countDocuments();

    if (finalUserCount + finalTrackCount + finalCommissionCount + finalContactCount === 0) {
      log('\n✅ All MongoDB collections successfully cleared!', 'green');
    } else {
      log('\n⚠️  Some documents may remain in collections', 'yellow');
    }

  } catch (error) {
    log(`\n❌ Error clearing MongoDB: ${error.message}`, 'red');
    throw error;
  } finally {
    await mongoose.disconnect();
    log('🔌 Disconnected from MongoDB', 'blue');
  }
}

async function clearS3Bucket() {
  log('\n🗑️  Clearing S3 Bucket...', 'yellow');
  
  if (!BUCKET_NAME) {
    log('⚠️  No AWS_BUCKET_NAME configured, skipping S3 cleanup', 'yellow');
    return;
  }

  try {
    // List all objects in the bucket
    log(`📂 Listing objects in bucket: ${BUCKET_NAME}`, 'blue');
    
    let continuationToken;
    let totalObjects = 0;
    let deletedObjects = 0;

    do {
      const listParams = {
        Bucket: BUCKET_NAME,
        MaxKeys: 1000,
        ContinuationToken: continuationToken
      };

      const listResult = await s3Client.send(new ListObjectsV2Command(listParams));
      
      if (listResult.Contents && listResult.Contents.length > 0) {
        totalObjects += listResult.Contents.length;
        
        log(`   Found ${listResult.Contents.length} objects to delete`, 'cyan');

        // Prepare objects for deletion
        const objectsToDelete = listResult.Contents.map(obj => ({ Key: obj.Key }));

        // Delete objects in batches
        const deleteParams = {
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: objectsToDelete,
            Quiet: false
          }
        };

        const deleteResult = await s3Client.send(new DeleteObjectsCommand(deleteParams));
        
        if (deleteResult.Deleted) {
          deletedObjects += deleteResult.Deleted.length;
          log(`   ✅ Deleted ${deleteResult.Deleted.length} objects`, 'green');
        }

        if (deleteResult.Errors && deleteResult.Errors.length > 0) {
          log(`   ❌ Failed to delete ${deleteResult.Errors.length} objects:`, 'red');
          deleteResult.Errors.forEach(error => {
            log(`      ${error.Key}: ${error.Message}`, 'red');
          });
        }
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);

    if (totalObjects === 0) {
      log('📭 S3 bucket is already empty', 'blue');
    } else {
      log(`\n✅ S3 cleanup complete! Deleted ${deletedObjects}/${totalObjects} objects`, 'green');
    }

  } catch (error) {
    log(`\n❌ Error clearing S3 bucket: ${error.message}`, 'red');
    throw error;
  }
}

async function resetIndexes() {
  log('\n🔄 Resetting database indexes...', 'yellow');
  
  try {
    await mongoose.connect(MONGO_URI);
    
    // Sync indexes for all models
    await User.syncIndexes();
    log('   ✅ User indexes synced', 'green');
    
    await BackingTrack.syncIndexes();
    log('   ✅ BackingTrack indexes synced', 'green');
    
    await CommissionRequest.syncIndexes();
    log('   ✅ CommissionRequest indexes synced', 'green');
    
    await ContactForm.syncIndexes();
    log('   ✅ ContactForm indexes synced', 'green');

  } catch (error) {
    log(`❌ Error resetting indexes: ${error.message}`, 'red');
    throw error;
  } finally {
    await mongoose.disconnect();
  }
}

function displayWarning() {
  log('⚠️  WARNING: DESTRUCTIVE OPERATION', 'red');
  log('═══════════════════════════════════', 'red');
  log('This script will permanently delete:', 'yellow');
  log('• ALL users from MongoDB', 'red');
  log('• ALL backing tracks from MongoDB', 'red');
  log('• ALL commission requests from MongoDB', 'red');
  log('• ALL contact forms from MongoDB', 'red');
  log('• ALL files from S3 bucket', 'red');
  log('═══════════════════════════════════', 'red');
  log('This action CANNOT be undone!', 'red');
  log('\nTo proceed, run: node clear_database_and_s3.js --confirm', 'yellow');
}

async function main() {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--confirm');

  log('🧹 Database and S3 Cleanup Script', 'magenta');
  log('==================================', 'magenta');

  if (!confirmed) {
    displayWarning();
    process.exit(0);
  }

  log('🚀 Starting cleanup process...', 'blue');
  
  try {
    // Clear MongoDB collections
    await clearMongoCollections();
    
    // Clear S3 bucket
    await clearS3Bucket();
    
    // Reset indexes
    await resetIndexes();
    
    log('\n🎉 Cleanup completed successfully!', 'green');
    log('✅ All MongoDB collections cleared', 'green');
    log('✅ All S3 files deleted', 'green');
    log('✅ Database indexes reset', 'green');

  } catch (error) {
    log(`\n💥 Cleanup failed: ${error.message}`, 'red');
    process.exit(1);
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

main();
