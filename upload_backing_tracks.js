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

// Track mappings with metadata
const trackMappings = [
  {
    filename: 'True colours more verb.wav',
    title: 'True Colours',
    originalArtist: 'Cyndi Lauper',
    description: 'A beautiful acoustic guitar backing track for the classic "True Colours" with subtle reverb.',
    price: 4.99,
    genre: 'Pop',
    key: 'G',
    backingTrackType: 'Acoustic Guitar',
    vocalRange: 'Mezzo-Soprano',
    instructions: 'Perfect for intimate performances. The guitar accompaniment follows the original chord progression.'
  },
  {
    filename: 'youve got a friend even less verb.wav',
    title: 'You\'ve Got A Friend',
    originalArtist: 'Carole King',
    description: 'Gentle acoustic guitar backing track for "You\'ve Got A Friend" with minimal reverb for a close, intimate sound.',
    price: 4.99,
    genre: 'Folk',
    key: 'A',
    backingTrackType: 'Acoustic Guitar',
    vocalRange: 'Tenor',
    instructions: 'Warm and supportive backing track. Great for both male and female vocals.'
  },
  {
    filename: 'Over The Rainbow.wav',
    title: 'Over The Rainbow',
    originalArtist: 'Judy Garland',
    description: 'Classic acoustic guitar arrangement of "Over The Rainbow" from The Wizard of Oz.',
    price: 5.99,
    genre: 'Musical Theatre',
    key: 'C',
    backingTrackType: 'Acoustic Guitar',
    vocalRange: 'Soprano',
    instructions: 'Timeless classic with beautiful fingerpicking patterns. Perfect for auditions and performances.'
  },
  {
    filename: 'Make you feel my love karaoke.wav',
    title: 'Make You Feel My Love',
    originalArtist: 'Bob Dylan',
    description: 'Heartfelt acoustic guitar backing track for "Make You Feel My Love" - perfect for emotional performances.',
    price: 4.99,
    genre: 'Folk',
    key: 'D',
    backingTrackType: 'Acoustic Guitar',
    vocalRange: 'Baritone',
    instructions: 'Slow, emotional ballad. Allow space for vocal expression and dynamics.'
  },
  {
    filename: 'landslide karaoke.wav',
    title: 'Landslide',
    originalArtist: 'Fleetwood Mac',
    description: 'Delicate acoustic guitar backing track for "Landslide" with fingerpicking style arrangement.',
    price: 4.99,
    genre: 'Rock',
    key: 'C',
    backingTrackType: 'Acoustic Guitar',
    vocalRange: 'Mezzo-Soprano',
    instructions: 'Gentle fingerpicking style. Perfect for showcasing vocal vulnerability and emotion.'
  },
  {
    filename: 'Close To You karaoke.wav',
    title: 'Close To You',
    originalArtist: 'The Carpenters',
    description: 'Smooth acoustic guitar backing track for "Close To You" with warm, mellow tones.',
    price: 4.99,
    genre: 'Pop',
    key: 'F',
    backingTrackType: 'Acoustic Guitar',
    vocalRange: 'Contralto',
    instructions: 'Smooth, warm backing track. Great for jazz-influenced vocal stylings.'
  },
  {
    filename: 'Something.wav',
    title: 'Something',
    originalArtist: 'The Beatles',
    description: 'Beautiful acoustic guitar arrangement of The Beatles\' "Something" - one of George Harrison\'s finest compositions.',
    price: 5.99,
    genre: 'Rock',
    key: 'C',
    backingTrackType: 'Acoustic Guitar',
    vocalRange: 'Tenor',
    instructions: 'Classic Beatles ballad with sophisticated chord progressions. Perfect for showcasing vocal range.'
  }
];

// Artist credentials for distribution
const artistCredentials = [
  {
    username: 'sarahandbenduo',
    email: 'sarahandbenduo@gmail.com',
    password: 'moobslikejabba123456'
  },
  {
    username: 'bennycjonesmusic',
    email: 'bennycjonesmusic@gmail.com', 
    password: 'moobslikejabba123456'
  },
  {
    username: 'bespokeacousticguitar',
    email: 'bespokeacousticguitarbackingtracks@gmail.com',
    password: 'moobslikejabba123456'
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

async function uploadBackingTracks() {
  try {
    const testAssetsDir = path.join(__dirname, 'test-assets');
    
    // Check if test-assets directory exists
    if (!fs.existsSync(testAssetsDir)) {
      throw new Error('test-assets directory not found');
    }

    log('\n🎵 Starting backing track upload via API process...', 'magenta');
    log(`📊 Found ${artistCredentials.length} artists to distribute tracks among`, 'cyan');
    log(`🎼 Found ${trackMappings.length} tracks to upload`, 'cyan');
    log('🌐 Using API endpoint: /tracks/upload', 'cyan');

    let uploadedCount = 0;
    let errorCount = 0;

    // Distribute tracks evenly among artists using round-robin
    for (let i = 0; i < trackMappings.length; i++) {
      const trackData = trackMappings[i];
      const artistIndex = i % artistCredentials.length; // Round-robin distribution
      const artist = artistCredentials[artistIndex];
      
      const filePath = path.join(testAssetsDir, trackData.filename);
      
      log(`\n🎯 Processing track ${i + 1}/${trackMappings.length}: "${trackData.title}"`, 'yellow');
      log(`   👤 Assigning to: ${artist.username}`, 'cyan');
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        log(`   ❌ Audio file not found: ${trackData.filename}`, 'red');
        errorCount++;
        continue;
      }

      try {
        // Login to get token
        log(`   🔐 Logging in as ${artist.username}...`, 'cyan');
        const token = await login(artist.email, artist.password);
        if (!token) {
          log(`   ❌ Failed to login as ${artist.username}`, 'red');
          errorCount++;
          continue;
        }

        // Create form data for track upload
        const form = new FormData();
        form.append('file', fs.createReadStream(filePath));
        form.append('title', trackData.title);
        form.append('originalArtist', trackData.originalArtist);
        form.append('description', trackData.description);
        form.append('price', trackData.price.toString());
        form.append('genre', trackData.genre);
        form.append('key', trackData.key);
        form.append('backingTrackType', trackData.backingTrackType);
        form.append('vocalRange', trackData.vocalRange);
        form.append('instructions', trackData.instructions);
        
        // Optional fields
        form.append('youtubeGuideUrl', '');
        form.append('guideTrackUrl', '');
        form.append('licenseStatus', 'not_required');
        form.append('licensedFrom', '');
        
        // Upload track via API
        log(`   📤 Uploading ${trackData.filename} via API...`, 'cyan');
        const uploadResponse = await axios.post(
          `${BASE_URL}/tracks/upload`,
          form,
          {
            headers: {
              ...form.getHeaders(),
              Authorization: `Bearer ${token}`
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
          }
        );
        
        if (uploadResponse.data.track) {
          const track = uploadResponse.data.track;
          uploadedCount++;
          log(`   ✅ Track uploaded successfully!`, 'green');
          log(`   🔗 Track ID: ${track._id || track.id}`, 'blue');
          log(`   💰 Price: $${trackData.price}`, 'blue');
          
          if (track.fileUrl) {
            log(`   📁 File URL: Available`, 'blue');
          }
          if (track.previewUrl) {
            log(`   🎧 Preview URL: Available`, 'blue');
          }
          if (uploadResponse.data.previewError) {
            log(`   ⚠️  Preview generation warning: ${uploadResponse.data.previewError}`, 'yellow');
          }
        } else {
          log(`   ❌ Upload response missing track data`, 'red');
          errorCount++;
        }
        
      } catch (error) {
        log(`   ❌ Failed to upload track "${trackData.title}": ${error.response?.data?.message || error.message}`, 'red');
        if (error.response?.data) {
          console.error('   Error details:', error.response.data);
        }
        errorCount++;
      }
    }

    log('\n🎉 Backing track upload process completed!', 'green');
    log(`📊 Summary:`, 'cyan');
    log(`   ✅ Successfully uploaded: ${uploadedCount} tracks`, 'green');
    log(`   ❌ Failed uploads: ${errorCount} tracks`, errorCount > 0 ? 'red' : 'green');

    // Show distribution summary by checking each artist's uploaded tracks
    log('\n📋 Checking uploaded tracks per artist:', 'cyan');
    for (const artist of artistCredentials) {
      try {
        const token = await login(artist.email, artist.password);
        if (token) {
          const tracksResponse = await axios.get(`${BASE_URL}/tracks/uploaded-tracks`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          const tracks = tracksResponse.data.tracks || [];
          log(`   🎤 ${artist.username}: ${tracks.length} tracks`, 'blue');
          tracks.forEach(track => {
            log(`      - ${track.title}`, 'blue');
          });
        }
      } catch (error) {
        log(`   ❌ ${artist.username}: Failed to retrieve tracks`, 'red');
      }
    }

  } catch (error) {
    log(`💥 Error: ${error.message}`, 'red');
    console.error(error);
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  log('🚀 Backing Track Upload & Distribution Script Starting...', 'magenta');
  log('📁 Looking for audio files in test-assets directory...', 'cyan');
  
  uploadBackingTracks().catch(error => {
    log(`💥 Unhandled error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

export { uploadBackingTracks };
