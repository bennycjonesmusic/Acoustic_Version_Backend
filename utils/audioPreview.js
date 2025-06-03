import { spawn } from 'child_process';
import fs from 'fs';

export async function getAudioPreview(inputPath, outputPath, duration = 30) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    // Log the ffmpeg path for debugging
    console.log('Using ffmpeg at:', ffmpegPath);
    const ffmpeg = spawn(ffmpegPath, [
      '-y', // overwrite output  
      '-i', inputPath,
      '-t', duration.toString(),
      '-vn', // Disable video processing
      '-acodec', 'libmp3lame', // Force MP3 encoding
      '-ab', '128k', // Set audio bitrate to 128kbps
      '-ar', '44100', // Set sample rate to 44.1kHz
      '-ac', '2', // Force stereo output
      '-f', 'mp3', // Force MP3 format
      outputPath
    ]);
    
    ffmpeg.stderr.on('data', (data) => {
      console.error(`ffmpeg stderr: ${data}`);
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        console.log(`ffmpeg preview generation completed successfully. Output: ${outputPath}`);
        resolve(); 
      } else {
        console.error(`ffmpeg exited with code ${code}. Output file exists: ${fs.existsSync(outputPath)}`);
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      console.error('ffmpeg spawn error:', err);
      reject(err);
    });
  });
}