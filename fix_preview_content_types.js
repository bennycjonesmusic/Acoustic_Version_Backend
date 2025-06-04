import { S3Client, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.AWS_BUCKET_NAME;

async function fixPreviewContentTypes() {
  try {
    console.log('Listing all preview files in S3...');
    
    // List all objects in the previews folder
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: 'previews/',
    });
    
    const listResponse = await s3Client.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      console.log('No preview files found.');
      return;
    }
    
    console.log(`Found ${listResponse.Contents.length} preview files.`);
    
    // Fix content type for each preview file
    for (const object of listResponse.Contents) {
      const key = object.Key;
      
      if (!key || key === 'previews/') {
        continue; // Skip the folder itself
      }
      
      console.log(`Fixing content type for: ${key}`);
      
      try {
        // Copy the object to itself with corrected metadata
        const copyCommand = new CopyObjectCommand({
          Bucket: BUCKET_NAME,
          CopySource: `${BUCKET_NAME}/${key}`,
          Key: key,
          ContentType: 'audio/mpeg',
          MetadataDirective: 'REPLACE',
        });
        
        await s3Client.send(copyCommand);
        console.log(`✓ Fixed content type for: ${key}`);
        
      } catch (error) {
        console.error(`✗ Failed to fix content type for ${key}:`, error.message);
      }
    }
    
    console.log('\nContent type fix completed!');
    
  } catch (error) {
    console.error('Error fixing preview content types:', error);
  }
}

// Run the script
fixPreviewContentTypes();