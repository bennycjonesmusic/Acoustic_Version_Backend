// middleware/avatar_moderation.js
// Middleware to check uploaded avatar images for offensive content using AWS Rekognition
import { RekognitionClient, DetectModerationLabelsCommand } from '@aws-sdk/client-rekognition';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const rekognition = new RekognitionClient({ region: process.env.AWS_REGION });
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Helper to extract S3 key from a full S3 URL
function getS3KeyFromUrl(url) {
  // e.g. https://bucket.s3.amazonaws.com/avatars/12345.jpg => avatars/12345.jpg
  const match = url.match(/\.amazonaws\.com\/(.+)$/);
  return match ? match[1] : null;
}

export default async function avatarModeration(req, res, next) {
  try {
    // Only run if an avatar was uploaded and has a location (S3 URL)
    if (!req.file || !req.file.location) return next();
    const s3Key = getS3KeyFromUrl(req.file.location);
    if (!s3Key) return next();
    const params = {
      Image: {
        S3Object: {
          Bucket: process.env.AWS_BUCKET_NAME,
          Name: s3Key,
        },
      },
      MinConfidence: 80,
    };
    const command = new DetectModerationLabelsCommand(params);
    const result = await rekognition.send(command);
    const offensive = result.ModerationLabels.some(label =>
      [
        'Explicit Nudity',
        'Suggestive',
        'Violence',
        'Hate Symbols',
        'Drugs',
        'Tobacco',
        'Alcohol',
        'Gambling',
      ].includes(label.Name)
    );
    if (offensive) {
      // Delete the offensive image from S3
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: s3Key,
      }));
      return res.status(400).json({ message: 'Offensive or inappropriate avatar detected. Please choose another image.' });
    }
    return next();
  } catch (err) {
    console.error('Error in avatar moderation middleware:', err);
    // Fail safe: allow the request to proceed if Rekognition fails
    return next();
  }
}
