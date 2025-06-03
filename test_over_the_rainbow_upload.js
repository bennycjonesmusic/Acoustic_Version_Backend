import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

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

async function loginArtist(email, password) {
  try {
    log(`🔐 Logging in ${email}...`, 'blue');
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      login: email,
      password: password
    });
    
    if (response.data && response.data.token) {
      log(`✅ Login successful for ${email}`, 'green');
      return response.data.token;
    } else {
      throw new Error('No token received');
    }
  } catch (error) {
    log(`❌ Login failed for ${email}: ${error.response?.data?.message || error.message}`, 'red');
    throw error;
  }
}

async function uploadTrack(token, trackData, filePath) {
  try {
    log(`📁 Preparing upload for: ${trackData.title}`, 'blue');
    
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const fileStats = fs.statSync(filePath);
    log(`📊 File size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`, 'yellow');
    
    const form = new FormData();
    
    // Add all track metadata
    Object.keys(trackData).forEach(key => {
      if (key !== 'filename') {
        form.append(key, trackData[key]);
      }
    });
    
    // Add the file
    form.append('file', fs.createReadStream(filePath));
    
    log(`🚀 Uploading ${trackData.title}...`, 'blue');
    const response = await axios.post(`${BASE_URL}/tracks/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${token}`
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    
    if (response.data && response.data.track) {
      log(`✅ Successfully uploaded: ${trackData.title}`, 'green');
      if (response.data.previewError) {
        log(`⚠️ Preview generation failed: ${response.data.previewError}`, 'yellow');
      }
      return response.data.track;
    } else {
      throw new Error('No track data received');
    }
  } catch (error) {
    log(`❌ Upload failed for ${trackData.title}: ${error.response?.data?.message || error.message}`, 'red');
    if (error.response?.data?.details) {
      log(`   Details: ${error.response.data.details}`, 'red');
    }
    throw error;
  }
}

async function main() {
  try {
    log('🎵 Testing "Over The Rainbow" Upload with Increased File Size Limit', 'cyan');
    log('=' .repeat(60), 'cyan');
    
    // Login as Sarahandbenduo
    const token = await loginArtist('sarahandbenduo@gmail.com', 'Moobslikejabba123456');
    
    // Track data for Over The Rainbow
    const trackData = {
      title: 'Over The Rainbow',
      originalArtist: 'Judy Garland',
      description: 'Classic acoustic guitar arrangement of "Over The Rainbow" from The Wizard of Oz.',
      price: 5.99,
      genre: 'Musical Theatre',
      backingTrackType: 'Acoustic Guitar',
      vocalRange: 'Soprano',
      instructions: 'Timeless classic with beautiful fingerpicking patterns. Perfect for auditions and performances.'
    };
    
    const filePath = path.join('test-assets', 'Over The Rainbow.wav');
    
    // Upload the track
    const uploadedTrack = await uploadTrack(token, trackData, filePath);
    
    log('📋 Upload Summary:', 'cyan');
    log(`   Track ID: ${uploadedTrack._id}`, 'green');
    log(`   Title: ${uploadedTrack.title}`, 'green');
    log(`   Artist: ${uploadedTrack.user}`, 'green');
    log(`   Price: $${uploadedTrack.price}`, 'green');
    log(`   File Size: ${uploadedTrack.fileSize ? (uploadedTrack.fileSize / 1024 / 1024).toFixed(2) + ' MB' : 'N/A'}`, 'green');
    
    if (uploadedTrack.previewUrl) {
      log(`   Preview URL: ${uploadedTrack.previewUrl}`, 'green');
    } else {
      log(`   Preview URL: Not generated`, 'yellow');
    }
    
    log('🎉 Test completed successfully!', 'green');
    
  } catch (error) {
    log(`💥 Test failed: ${error.message}`, 'red');
    process.exit(1);
  }
}

main();
