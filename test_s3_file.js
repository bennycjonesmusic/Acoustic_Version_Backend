import dotenv from 'dotenv';
dotenv.config();

import { S3Client, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const FILE_KEY = 'examples/6840947b1c716c3f8bebab4b_1749736233017.mp3';

async function testFile() {
  try {
    console.log('🔍 Testing file existence in S3...');
    console.log('Bucket:', BUCKET_NAME);
    console.log('File Key:', FILE_KEY);
    
    // Try to get file metadata
    const headCommand = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: FILE_KEY
    });

    const response = await s3Client.send(headCommand);
    console.log('✅ File exists!');
    console.log('File metadata:', {
      ContentType: response.ContentType,
      ContentLength: response.ContentLength,
      LastModified: response.LastModified,
      ETag: response.ETag
    });
    
    // Also list files in examples folder to see what's there
    console.log('\n📁 Listing files in examples/ folder:');
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'examples/',
      MaxKeys: 10
    });
    
    const listResponse = await s3Client.send(listCommand);
    if (listResponse.Contents) {
      listResponse.Contents.forEach(obj => {
        console.log(`  - ${obj.Key} (${obj.Size} bytes)`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error testing file:', error);
    
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      console.log('🔍 File does not exist in S3. Let me list what\'s in the examples folder:');
      
      try {
        const listCommand = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: 'examples/',
          MaxKeys: 20
        });
        
        const listResponse = await s3Client.send(listCommand);
        if (listResponse.Contents && listResponse.Contents.length > 0) {
          console.log('📁 Files in examples/ folder:');
          listResponse.Contents.forEach(obj => {
            console.log(`  - ${obj.Key} (${obj.Size} bytes)`);
          });
        } else {
          console.log('📁 No files found in examples/ folder');
        }
      } catch (listError) {
        console.error('❌ Error listing files:', listError);
      }
    }
  }
}

testFile();
