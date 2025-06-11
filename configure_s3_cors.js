import dotenv from 'dotenv';
dotenv.config();

import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

async function configureCORS() {
  try {
    console.log('🔧 Configuring CORS for S3 bucket:', BUCKET_NAME);
    
    const corsConfiguration = {
      CORSRules: [
        {
          AllowedOrigins: [
            'http://localhost:3002',
            'http://localhost:3003', 
            'https://acoustic-version.com',
            'https://www.acoustic-version.com'
          ],
          AllowedMethods: ['GET', 'HEAD'],
          AllowedHeaders: [
            'Authorization',
            'Content-Type',
            'Range',
            'Content-Range',
            'Accept',
            'Accept-Encoding',
            'Accept-Language',
            'Cache-Control',
            'User-Agent'
          ],
          ExposeHeaders: [
            'Content-Length',
            'Content-Type',
            'Content-Range',
            'Accept-Ranges',
            'Cache-Control',
            'Last-Modified',
            'ETag'
          ],
          MaxAgeSeconds: 3600
        },
        {
          // Allow all origins for public preview audio files
          AllowedOrigins: ['*'],
          AllowedMethods: ['GET', 'HEAD'],
          AllowedHeaders: [
            'Range',
            'Content-Range',
            'Accept',
            'Accept-Encoding',
            'Cache-Control',
            'User-Agent'
          ],
          ExposeHeaders: [
            'Content-Length',
            'Content-Type',
            'Content-Range',
            'Accept-Ranges',
            'Cache-Control',
            'Last-Modified'
          ],
          MaxAgeSeconds: 86400 // 24 hours for public audio
        }
      ]
    };

    const command = new PutBucketCorsCommand({
      Bucket: BUCKET_NAME,
      CORSConfiguration: corsConfiguration
    });

    await s3Client.send(command);
    
    console.log('✅ CORS configuration applied successfully!');
    console.log('📋 CORS Rules:');
    console.log(JSON.stringify(corsConfiguration, null, 2));
    
  } catch (error) {
    console.error('❌ Error configuring CORS:', error);
    process.exit(1);
  }
}

// Run the configuration
configureCORS();
