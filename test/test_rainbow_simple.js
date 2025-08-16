import dotenv from 'dotenv';
dotenv.config();
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function testOverTheRainbowUpload() {
  console.log('🎵 Testing Over The Rainbow Upload');
  console.log('File size limit increased to 100MB');
  console.log('FFmpeg fixed to force MP3 encoding');
  console.log('='.repeat(50));
  
  try {
    // Login
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      login: 'sarahandbenduo@gmail.com',
      password: 'test-password-123'
    });
    
    if (!loginResponse.data.token) {
      throw new Error('No token received');
    }
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    
    // Check file exists and get size
    const filePath = path.join('test-assets', 'Over The Rainbow.wav');
    const fileStats = fs.statSync(filePath);
    const fileSizeMB = (fileStats.size / 1024 / 1024).toFixed(2);
    
    console.log(`📁 File: ${filePath}`);
    console.log(`📊 Size: ${fileSizeMB} MB (Previous limit was 50MB, new limit is 100MB)`);
    
    // Prepare form data
    const form = new FormData();
    form.append('title', 'Over The Rainbow');
    form.append('originalArtist', 'Judy Garland');
    form.append('description', 'Classic acoustic guitar arrangement of Over The Rainbow from The Wizard of Oz.');
    form.append('price', '5.99');
    form.append('genre', 'Musical Theatre');
    form.append('backingTrackType', 'Acoustic Guitar');
    form.append('vocalRange', 'Soprano');
    form.append('instructions', 'Timeless classic with beautiful fingerpicking patterns. Perfect for auditions and performances.');
    form.append('file', fs.createReadStream(filePath));
    
    console.log('🚀 Starting upload...');
    
    const uploadResponse = await axios.post(`${BASE_URL}/tracks/upload`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${token}`
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000 // 2 minute timeout
    });
    
    console.log('📋 Upload Response:');
    console.log(JSON.stringify(uploadResponse.data, null, 2));
    
    if (uploadResponse.data.message === 'File uploaded successfully!') {
      console.log('✅ SUCCESS: Over The Rainbow uploaded successfully!');
      console.log(`📝 Track ID: ${uploadResponse.data.track._id}`);
      if (uploadResponse.data.track.previewUrl) {
        console.log(`🎵 Preview URL: ${uploadResponse.data.track.previewUrl}`);
      }
    } else if (uploadResponse.data.message === 'File uploaded, but preview failed') {
      console.log('⚠️ PARTIAL SUCCESS: File uploaded but preview generation failed');
      console.log(`📝 Track ID: ${uploadResponse.data.track._id}`);
      console.log(`❌ Preview Error: ${uploadResponse.data.previewError}`);
    } else {
      console.log('❓ Upload response unclear');
    }
    
  } catch (error) {
    console.log('❌ ERROR occurred:');
    if (error.response) {
      console.log(`Status: ${error.response.status}`);
      console.log(`Message: ${error.response.data?.message || 'No message'}`);
      console.log(`Details: ${error.response.data?.details || 'No details'}`);
    } else {
      console.log(`Error: ${error.message}`);
    }
    throw error;
  }
}

testOverTheRainbowUpload()
  .then(() => {
    console.log('\n🎉 Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.log('\n💥 Test failed!');
    process.exit(1);
  });
