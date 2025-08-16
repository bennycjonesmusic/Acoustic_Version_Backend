import dotenv from 'dotenv';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';

dotenv.config();

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'eu-north-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

async function testUpload() {
  try {
    // Test 1: Upload using Upload class like in the controller
    console.log('Testing Upload class method...');
    const testKey = `previews/test-upload-${Date.now()}.mp3`;
    
    // Create a simple test buffer (just some dummy audio data)
    const testBuffer = Buffer.from('test audio data for upload debugging');
    
    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: testKey,
      Body: testBuffer,
      StorageClass: 'STANDARD',
      ContentType: 'audio/mpeg',
      ACL: 'public-read'
    };
    
    console.log('Upload params:', uploadParams);
    
    const uploadResult = await new Upload({ 
      client: s3Client, 
      params: uploadParams 
    }).done();
    
    console.log('Upload result:', uploadResult);
    
    // Now check the content type
    const { execSync } = await import('child_process');
    const curlResult = execSync(`curl -I "${uploadResult.Location}"`, { encoding: 'utf8' });
    console.log('Curl result:', curlResult);
    
  } catch (error) {
    console.error('Error:', error);
  }
}

testUpload();
