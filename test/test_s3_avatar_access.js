import dotenv from 'dotenv';
dotenv.config();
import { S3Client, GetPublicAccessBlockCommand, GetBucketPolicyCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import axios from 'axios';

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

async function checkPublicAccessBlock() {
  try {
    log('\n🔒 Checking Public Access Block settings...', 'yellow');
    const command = new GetPublicAccessBlockCommand({ Bucket: BUCKET_NAME });
    const response = await s3Client.send(command);
    
    log('📋 Public Access Block Configuration:', 'blue');
    log(`   BlockPublicAcls: ${response.PublicAccessBlockConfiguration.BlockPublicAcls}`, 'cyan');
    log(`   IgnorePublicAcls: ${response.PublicAccessBlockConfiguration.IgnorePublicAcls}`, 'cyan');
    log(`   BlockPublicPolicy: ${response.PublicAccessBlockConfiguration.BlockPublicPolicy}`, 'cyan');
    log(`   RestrictPublicBuckets: ${response.PublicAccessBlockConfiguration.RestrictPublicBuckets}`, 'cyan');
    
    if (response.PublicAccessBlockConfiguration.BlockPublicPolicy || 
        response.PublicAccessBlockConfiguration.RestrictPublicBuckets) {
      log('\n❌ PROBLEM FOUND: Public Access Block is preventing your bucket policy!', 'red');
      log('   BlockPublicPolicy and/or RestrictPublicBuckets must be FALSE for bucket policies to work', 'red');
    } else {
      log('\n✅ Public Access Block settings allow bucket policies', 'green');
    }
    
    return response.PublicAccessBlockConfiguration;
  } catch (error) {
    if (error.name === 'NoSuchPublicAccessBlockConfiguration') {
      log('✅ No Public Access Block configured (this is good)', 'green');
      return null;
    }
    log(`❌ Error checking Public Access Block: ${error.message}`, 'red');
    throw error;
  }
}

async function checkBucketPolicy() {
  try {
    log('\n📜 Checking Bucket Policy...', 'yellow');
    const command = new GetBucketPolicyCommand({ Bucket: BUCKET_NAME });
    const response = await s3Client.send(command);
    
    const policy = JSON.parse(response.Policy);
    log('📋 Current Bucket Policy:', 'blue');
    console.log(JSON.stringify(policy, null, 2));
    
    // Check if the avatar policy exists
    const avatarPolicy = policy.Statement.find(statement => 
      statement.Resource === `arn:aws:s3:::${BUCKET_NAME}/avatars/*`
    );
    
    if (avatarPolicy) {
      log('\n✅ Avatar policy found in bucket policy', 'green');
    } else {
      log('\n❌ Avatar policy NOT found in bucket policy', 'red');
    }
    
    return policy;
  } catch (error) {
    if (error.name === 'NoSuchBucketPolicy') {
      log('❌ No bucket policy found!', 'red');
      return null;
    }
    log(`❌ Error checking bucket policy: ${error.message}`, 'red');
    throw error;
  }
}

async function listAvatarFiles() {
  try {
    log('\n📁 Listing avatar files...', 'yellow');
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'avatars/',
      MaxKeys: 10
    });
    
    const response = await s3Client.send(command);
    
    if (response.Contents && response.Contents.length > 0) {
      log(`📋 Found ${response.Contents.length} avatar files:`, 'blue');
      response.Contents.forEach((obj, index) => {
        log(`   ${index + 1}. ${obj.Key} (${obj.Size} bytes)`, 'cyan');
      });
      return response.Contents;
    } else {
      log('📭 No avatar files found', 'yellow');
      return [];
    }
  } catch (error) {
    log(`❌ Error listing avatar files: ${error.message}`, 'red');
    throw error;
  }
}

async function testPublicAccess(avatarFiles) {
  if (!avatarFiles || avatarFiles.length === 0) {
    log('\n⚠️  No avatar files to test public access', 'yellow');
    return;
  }
  
  log('\n🌐 Testing public access to avatar files...', 'yellow');
  
  for (let i = 0; i < Math.min(3, avatarFiles.length); i++) {
    const file = avatarFiles[i];
    const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${file.Key}`;
    
    try {
      log(`   Testing: ${file.Key}`, 'cyan');
      log(`   URL: ${publicUrl}`, 'blue');
      
      const response = await axios.head(publicUrl, { timeout: 5000 });
      log(`   ✅ ACCESSIBLE - Status: ${response.status}`, 'green');
    } catch (error) {
      if (error.response) {
        log(`   ❌ NOT ACCESSIBLE - Status: ${error.response.status} (${error.response.statusText})`, 'red');
        if (error.response.status === 403) {
          log('      This indicates a permissions issue with your bucket policy', 'red');
        }
      } else {
        log(`   ❌ CONNECTION ERROR: ${error.message}`, 'red');
      }
    }
  }
}

async function generateCorrectPolicy() {
  log('\n📝 Generating correct bucket policy...', 'yellow');
  
  const correctPolicy = {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Sid": "AllowPublicReadForAvatarsOnly",
        "Effect": "Allow",
        "Principal": "*",
        "Action": "s3:GetObject",
        "Resource": `arn:aws:s3:::${BUCKET_NAME}/avatars/*`
      }
    ]
  };
  
  log('📋 Correct bucket policy for your setup:', 'blue');
  console.log(JSON.stringify(correctPolicy, null, 2));
  
  log('\n🔧 To apply this policy:', 'cyan');
  log('1. Go to AWS S3 Console', 'cyan');
  log('2. Select your bucket: backing-tracks-uk', 'cyan');
  log('3. Go to Permissions tab', 'cyan');
  log('4. Edit Bucket Policy and paste the above JSON', 'cyan');
  log('5. Make sure Public Access Block allows bucket policies', 'cyan');
}

async function main() {
  try {
    log('🔍 S3 Avatar Access Diagnostic Tool', 'magenta');
    log('=====================================', 'magenta');
    log(`Bucket: ${BUCKET_NAME}`, 'blue');
    log(`Region: ${process.env.AWS_REGION}`, 'blue');
    
    // Check Public Access Block
    const publicAccessBlock = await checkPublicAccessBlock();
    
    // Check Bucket Policy
    const bucketPolicy = await checkBucketPolicy();
    
    // List avatar files
    const avatarFiles = await listAvatarFiles();
    
    // Test public access
    await testPublicAccess(avatarFiles);
    
    // Generate correct policy
    await generateCorrectPolicy();
    
    log('\n🎯 DIAGNOSIS SUMMARY:', 'magenta');
    log('===================', 'magenta');
    
    if (!bucketPolicy) {
      log('❌ No bucket policy found - you need to add one', 'red');
    } else {
      const hasAvatarPolicy = bucketPolicy.Statement.some(s => 
        s.Resource === `arn:aws:s3:::${BUCKET_NAME}/avatars/*`
      );
      if (hasAvatarPolicy) {
        log('✅ Bucket policy includes avatar permissions', 'green');
      } else {
        log('❌ Bucket policy missing avatar permissions', 'red');
      }
    }
    
    if (publicAccessBlock && (publicAccessBlock.BlockPublicPolicy || publicAccessBlock.RestrictPublicBuckets)) {
      log('❌ Public Access Block is preventing bucket policies', 'red');
      log('   You need to disable BlockPublicPolicy and RestrictPublicBuckets', 'red');
    } else {
      log('✅ Public Access Block allows bucket policies', 'green');
    }
    
  } catch (error) {
    log(`💥 Diagnostic failed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  }
}

main();
