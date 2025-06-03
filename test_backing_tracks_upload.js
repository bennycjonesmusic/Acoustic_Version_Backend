import { uploadBackingTracksViaAPI } from './upload_backing_tracks_via_api.js';

console.log('🚀 Backing Track Upload via API Script Starting...');
console.log('📁 Looking for audio files in test-assets directory...');
console.log('🔍 Debug: process.argv[1]:', process.argv[1]);
console.log('🔍 Debug: import.meta.url:', import.meta.url);

try {
  await uploadBackingTracksViaAPI();
} catch (error) {
  console.log(`💥 Unhandled error: ${error.message}`);
  console.error(error);
  process.exit(1);
};
