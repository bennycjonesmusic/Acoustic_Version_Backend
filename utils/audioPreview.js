import { spawn } from 'child_process';
import fs from 'fs';

export async function getAudioPreview(inputPath, outputPath, duration = 30) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    
    console.log('🎵 Starting audio preview generation...');
    console.log(`Input: ${inputPath}`);
    console.log(`Output: ${outputPath}`);
    console.log(`Duration: ${duration}s`);
    console.log('Input file exists:', fs.existsSync(inputPath));
    console.log('Input file size:', fs.existsSync(inputPath) ? fs.statSync(inputPath).size : 'N/A');
    
    // First, validate the input file with ffprobe
    const ffprobe = spawn('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json', 
      '-show_format',
      '-show_streams',
      inputPath
    ]);
    
    let probeOutput = '';
    let probeError = '';
    
    ffprobe.stdout.on('data', (data) => {
      probeOutput += data.toString();
    });
    
    ffprobe.stderr.on('data', (data) => {
      probeError += data.toString();
    });
    
    ffprobe.on('close', (probeCode) => {
      let inputDuration = null;
      let isValidAudio = false;
      
      if (probeCode === 0 && probeOutput) {
        try {
          const probeData = JSON.parse(probeOutput);
          inputDuration = parseFloat(probeData.format.duration);
          isValidAudio = probeData.streams && probeData.streams.some(s => s.codec_type === 'audio');
          
          console.log(`✅ Input validation: ${probeData.format.format_name}, duration: ${inputDuration}s, audio streams: ${probeData.streams.filter(s => s.codec_type === 'audio').length}`);
          
          if (!isValidAudio) {
            reject(new Error('Input file contains no audio streams'));
            return;
          }
          
          if (inputDuration <= 0) {
            reject(new Error(`Input file has invalid duration: ${inputDuration}s`));
            return;
          }
          
        } catch (parseErr) {
          console.warn('⚠️ Could not parse ffprobe output, proceeding anyway');
        }
      } else {
        console.warn(`⚠️ ffprobe validation failed (code: ${probeCode}), error: ${probeError}`);
        console.warn('Proceeding with ffmpeg conversion anyway...');
      }
      
      // Adjust duration if input is shorter than requested
      const actualDuration = inputDuration && inputDuration < duration ? inputDuration : duration;
      console.log(`Using duration: ${actualDuration}s`);
      
      // Now run the actual conversion
      const ffmpeg = spawn(ffmpegPath, [
        '-y', // overwrite output  
        '-i', inputPath,
        '-t', actualDuration.toString(),
        '-vn', // Disable video processing
        '-acodec', 'libmp3lame', // Force MP3 encoding
        '-ab', '128k', // Set audio bitrate to 128kbps
        '-ar', '44100', // Set sample rate to 44.1kHz
        '-ac', '2', // Force stereo output
        '-f', 'mp3', // Force MP3 format
        outputPath
      ]);
      
      let stderrOutput = '';
      let stdoutOutput = '';
      
      ffmpeg.stdout.on('data', (data) => {
        stdoutOutput += data.toString();
      });
      
      ffmpeg.stderr.on('data', (data) => {
        const output = data.toString();
        stderrOutput += output;
        
        // Only log important ffmpeg messages, not the verbose output
        if (output.includes('Error') || output.includes('Invalid') || output.includes('Failed')) {
          console.error(`ffmpeg error: ${output.trim()}`);
        }
      });
      
      ffmpeg.on('close', (code) => {
        console.log(`ffmpeg completed with exit code: ${code}`);
        
        if (code === 0 && fs.existsSync(outputPath)) {
          const outputSize = fs.statSync(outputPath).size;
          console.log(`✅ Preview generated successfully: ${outputSize} bytes`);
          
          // Validate the output file
          if (outputSize < 1000) {
            console.error(`⚠️ WARNING: Output file is suspiciously small (${outputSize} bytes)`);
            console.error('This usually indicates the input file had no audio content');
            reject(new Error(`Preview generation produced invalid output (${outputSize} bytes)`));
            return;
          }
          
          resolve(); 
        } else {
          console.error(`❌ ffmpeg failed with exit code ${code}`);
          console.error('Output file exists:', fs.existsSync(outputPath));
          if (stderrOutput) {
            console.error('ffmpeg stderr:', stderrOutput.slice(-500)); // Last 500 chars
          }
          reject(new Error(`ffmpeg exited with code ${code}. stderr: ${stderrOutput.slice(-200)}`));
        }
      });
      
      ffmpeg.on('error', (err) => {
        console.error('ffmpeg spawn error:', err);
        reject(err);
      });
    });
    
    ffprobe.on('error', (err) => {
      console.warn('ffprobe spawn error, proceeding anyway:', err.message);
      // Continue with ffmpeg even if ffprobe fails
      ffprobe.emit('close', 1);
    });
  });
}