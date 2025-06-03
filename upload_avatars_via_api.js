import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES modules equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';

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

// Avatar mappings
const avatarMappings = [
  {
    username: 'Sarahandbenduo',
    email: 'sarahandbenduo@gmail.com',
    password: 'Moobslikejabba123456',
    filename: 'Sarahandbenduo.jpg'
  },
  {
    username: 'Bennycjonesmusic', 
    email: 'bennycjonesmusic@gmail.com',
    password: 'Moobslikejabba123456',
    filename: 'bennycjonesmusiclogo.jpg'
  },
  {
    username: 'bespokeacousticguitar',
    email: 'bespokeacousticguitarbackingtracks@gmail.com',
    password: 'Moobslikejabba123456',
    filename: 'bespokeacousticguitarbackingtracks.jpg'
  }
];

// Login function
async function login(email, password) {
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      login: email,
      password: password
    });
    return response.data.token;
  } catch (error) {
    log(`❌ Login failed for ${email}: ${error.response?.data?.message || error.message}`, 'red');
    return null;
  }
}

async function uploadAvatarsViaAPI() {
  try {
    const testAssetsDir = path.join(__dirname, 'test-assets');
    
    // Check if test-assets directory exists
    if (!fs.existsSync(testAssetsDir)) {
      throw new Error('test-assets directory not found');
    }

    log('\n📸 Starting avatar upload via API process...', 'magenta');
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const mapping of avatarMappings) {
      const { username, email, password, filename } = mapping;
      const filePath = path.join(testAssetsDir, filename);
      
      log(`\n🎯 Processing ${username}...`, 'yellow');
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        log(`❌ Avatar file not found: ${filename}`, 'red');
        errorCount++;
        continue;
      }

      try {
        // Login to get token
        log(`  🔐 Logging in as ${username}...`, 'cyan');
        const token = await login(email, password);
        if (!token) {
          log(`  ❌ Failed to login as ${username}`, 'red');
          errorCount++;
          continue;
        }

        // Create form data for avatar upload
        const form = new FormData();
        form.append('avatar', fs.createReadStream(filePath));
        
        // Upload avatar via API
        log(`  📤 Uploading ${filename} via API...`, 'cyan');
        const uploadResponse = await axios.patch(
          `${BASE_URL}/users/profile`,
          form,
          {
            headers: {
              ...form.getHeaders(),
              Authorization: `Bearer ${token}`
            }
          }
        );
        
        if (uploadResponse.data.user && uploadResponse.data.user.avatar) {
          successCount++;
          log(`  ✅ Avatar uploaded successfully!`, 'green');
          log(`  🔗 Avatar URL: ${uploadResponse.data.user.avatar}`, 'blue');
        } else {
          log(`  ❌ Upload succeeded but no avatar URL returned`, 'red');
          errorCount++;
        }
        
      } catch (error) {
        log(`  ❌ Failed to upload avatar for ${username}: ${error.response?.data?.message || error.message}`, 'red');
        errorCount++;
      }
    }

    log('\n🎉 Avatar upload process completed!', 'green');
    log(`📊 Summary:`, 'cyan');
    log(`   ✅ Successfully uploaded: ${successCount} avatars`, 'green');
    log(`   ❌ Failed uploads: ${errorCount} avatars`, errorCount > 0 ? 'red' : 'green');

    // Verify uploads by checking each user
    log('\n📋 Verification - checking user profiles:', 'cyan');
    for (const mapping of avatarMappings) {
      try {
        const token = await login(mapping.email, mapping.password);
        if (token) {
          const userResponse = await axios.get(`${BASE_URL}/users/me`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (userResponse.data.user && userResponse.data.user.avatar) {
            log(`  ✅ ${mapping.username}: Avatar set successfully`, 'green');
          } else {
            log(`  ❌ ${mapping.username}: No avatar found`, 'red');
          }
        }
      } catch (error) {
        log(`  ❌ ${mapping.username}: Verification failed`, 'red');
      }
    }

  } catch (error) {
    log(`💥 Error: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  log('🚀 Avatar Upload via API Script Starting...', 'magenta');
  log('📁 Looking for avatar files in test-assets directory...', 'cyan');
  log('🌐 Using API endpoint: /users/profile', 'cyan');
  
  uploadAvatarsViaAPI().catch(error => {
    log(`💥 Unhandled error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

export { uploadAvatarsViaAPI };
