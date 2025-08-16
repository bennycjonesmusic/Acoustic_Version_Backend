import { uploadAvatarsViaAPI } from './upload_avatars_via_api.js';

console.log('🚀 Avatar Upload via API Script Starting...');
console.log('📁 Looking for avatar files in test-assets directory...');
console.log('🌐 Using API endpoint: /users/profile');
console.log('🔍 Debug: process.argv[1]:', process.argv[1]);
console.log('🔍 Debug: import.meta.url:', import.meta.url);

uploadAvatarsViaAPI().catch(error => {
  console.log(`💥 Unhandled error: ${error.message}`);
  console.error(error);
  process.exit(1);
});
