import { spawn } from 'child_process';
import fs from 'fs';

/**
 * Detects silence at the beginning and end of an audio file
 * @param {string} inputPath - Path to input audio file
 * @returns {Promise<{start: number, end: number}>} - Start and end times of actual audio content
 */
export async function detectSilence(inputPath) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    
    // Use ffmpeg's silencedetect filter to find silence
    const ffmpeg = spawn(ffmpegPath, [
      '-i', inputPath,
      '-af', 'silencedetect=noise=-50dB:duration=0.5', // Detect silence quieter than -50dB lasting 0.5+ seconds
      '-f', 'null',
      '-'
    ]);
    
    let stderr = '';
    
    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg exited with code ${code}`));
      }
      
      // Parse silence detection output
      const silenceLines = stderr.split('\n').filter(line => line.includes('silence_'));
      
      let audioStart = 0;
      let audioEnd = null;
      
      // Find the end of initial silence (start of audio)
      for (const line of silenceLines) {
        if (line.includes('silence_end:')) {
          const match = line.match(/silence_end:\s*([\d.]+)/);
          if (match) {
            audioStart = parseFloat(match[1]);
            break;
          }
        }
      }
      
      // Find the start of final silence (end of audio)
      for (let i = silenceLines.length - 1; i >= 0; i--) {
        const line = silenceLines[i];
        if (line.includes('silence_start:')) {
          const match = line.match(/silence_start:\s*([\d.]+)/);
          if (match) {
            audioEnd = parseFloat(match[1]);
            break;
          }
        }
      }
      
      console.log(`Silence detection: audio starts at ${audioStart}s, ends at ${audioEnd || 'end'}s`);
      resolve({ start: audioStart, end: audioEnd });
    });
    
    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Trims silence from the beginning (and optionally end) of an audio file
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path to output audio file
 * @param {object} options - Trimming options
 * @param {boolean} options.trimStart - Whether to trim silence from start (default: true)
 * @param {boolean} options.trimEnd - Whether to trim silence from end (default: false)
 * @param {string} options.format - Output format (default: preserve input format)
 */
export async function trimSilence(inputPath, outputPath, options = {}) {
  const { trimStart = true, trimEnd = false, format = null } = options;
  
  if (!trimStart && !trimEnd) {
    // If no trimming requested, just copy the file
    fs.copyFileSync(inputPath, outputPath);
    return;
  }
  
  try {
    const silenceInfo = await detectSilence(inputPath);
    
    return new Promise((resolve, reject) => {
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      const args = ['-y', '-i', inputPath];
      
      // Build ffmpeg arguments for trimming
      if (trimStart && silenceInfo.start > 0.1) { // Only trim if there's meaningful silence (>0.1s)
        args.push('-ss', silenceInfo.start.toString());
      }
      
      if (trimEnd && silenceInfo.end) {
        const duration = silenceInfo.end - (trimStart ? silenceInfo.start : 0);
        args.push('-t', duration.toString());
      }
      
      // Add format-specific arguments
      if (format === 'mp3') {
        args.push('-acodec', 'libmp3lame', '-ab', '128k', '-ar', '44100', '-ac', '2', '-f', 'mp3');
      } else if (format) {
        args.push('-f', format);
      }
      
      args.push(outputPath);
      
      console.log('Trimming silence with command:', ffmpegPath, args.join(' '));
      
      const ffmpeg = spawn(ffmpegPath, args);
      
      ffmpeg.stderr.on('data', (data) => {
        console.log(`ffmpeg trim stderr: ${data}`);
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          console.log(`Silence trimming completed successfully. Output: ${outputPath}`);
          resolve();
        } else {
          console.error(`ffmpeg trim exited with code ${code}. Output file exists: ${fs.existsSync(outputPath)}`);
          reject(new Error(`ffmpeg trim exited with code ${code}`));
        }
      });
      
      ffmpeg.on('error', (err) => {
        console.error('ffmpeg trim spawn error:', err);
        reject(err);
      });
    });
  } catch (err) {
    throw new Error(`Silence trimming failed: ${err.message}`);
  }
}

/**
 * Creates a preview with silence trimmed and duration limited
 * @param {string} inputPath - Path to input audio file
 * @param {string} outputPath - Path to output preview file
 * @param {number} duration - Maximum duration for preview (default: 30 seconds)
 * @param {boolean} trimSilenceFromStart - Whether to trim silence from start (default: true)
 */
export async function getAudioPreviewWithTrimming(inputPath, outputPath, duration = 30, trimSilenceFromStart = true) {
  return new Promise(async (resolve, reject) => {
    try {
      const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
      let args = ['-y', '-i', inputPath];
      
      // If trimming is enabled, detect silence and start from after initial silence
      if (trimSilenceFromStart) {
        const silenceInfo = await detectSilence(inputPath);
        if (silenceInfo.start > 0.1) { // Only trim if there's meaningful silence (>0.1s)
          args.push('-ss', silenceInfo.start.toString());
          console.log(`Trimming initial silence: starting from ${silenceInfo.start}s`);
        }
      }
      
      // Set duration, format, and quality
      args.push(
        '-t', duration.toString(),
        '-vn', // Disable video processing
        '-acodec', 'libmp3lame', // Force MP3 encoding
        '-ab', '128k', // Set audio bitrate to 128kbps
        '-ar', '44100', // Set sample rate to 44.1kHz
        '-ac', '2', // Force stereo output
        '-f', 'mp3', // Force MP3 format
        outputPath
      );
      
      console.log('Creating preview with trimming:', ffmpegPath, args.join(' '));
      
      const ffmpeg = spawn(ffmpegPath, args);
      
      ffmpeg.stderr.on('data', (data) => {
        console.log(`ffmpeg preview stderr: ${data}`);
      });
      
      ffmpeg.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          console.log(`Preview with trimming completed successfully. Output: ${outputPath}`);
          resolve();
        } else {
          console.error(`ffmpeg preview exited with code ${code}. Output file exists: ${fs.existsSync(outputPath)}`);
          reject(new Error(`ffmpeg preview exited with code ${code}`));
        }
      });
      
      ffmpeg.on('error', (err) => {
        console.error('ffmpeg preview spawn error:', err);
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}
