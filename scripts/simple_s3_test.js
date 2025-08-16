console.log('🔍 Testing S3 Avatar Access...');

import dotenv from 'dotenv';
dotenv.config();

console.log('Environment loaded:', {
  BUCKET_NAME: process.env.AWS_BUCKET_NAME,
  REGION: process.env.AWS_REGION,
  HAS_ACCESS_KEY: !!process.env.AWS_ACCESS_KEY_ID,
  HAS_SECRET_KEY: !!process.env.AWS_SECRET_ACCESS_KEY
});

try {
  const { S3Client, GetPublicAccessBlockCommand } = await import('@aws-sdk/client-s3');
  
  const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });
  
  console.log('✅ S3 Client created successfully');
  
  // Test basic S3 connection
  const command = new GetPublicAccessBlockCommand({ Bucket: process.env.AWS_BUCKET_NAME });
  console.log('🔄 Testing S3 connection...');
  
  try {
    const response = await s3Client.send(command);
    console.log('✅ S3 connection successful');
    console.log('📋 Public Access Block Configuration:', response.PublicAccessBlockConfiguration);
  } catch (error) {
    if (error.name === 'NoSuchPublicAccessBlockConfiguration') {
      console.log('✅ No Public Access Block configured (bucket policy should work)');
    } else {
      console.log('❌ S3 Error:', error.name, error.message);
    }
  }
  
} catch (error) {
  console.log('❌ Import or setup error:', error.message);
}
