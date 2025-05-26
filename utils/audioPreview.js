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
      '-acodec', 'copy',
      outputPath
    ]);
    ffmpeg.stderr.on('data', (data) => {
      console.error(`ffmpeg stderr: ${data}`);
    });
    ffmpeg.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve(); 
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
}