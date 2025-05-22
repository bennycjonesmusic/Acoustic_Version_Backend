import dotenv from 'dotenv';
dotenv.config();
import ffmpeg from 'fluent-ffmpeg';

if (process.env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
}

ffmpeg()._getFfmpegPath((err, path) => {
  if (err) {
    console.error('Error getting ffmpeg path:', err);
  } else {
    console.log('Using ffmpeg binary at:', path);
    ffmpeg().addInput('dummy').on('error', () => {}).ffprobe((err) => {
      if (err) {
        // This is expected since 'dummy' doesn't exist, but it means ffmpeg ran!
        ffmpeg().setFfmpegPath(path).ffmpegProc = null;
        ffmpeg()._getFfmpegVersion((err, version) => {
          if (err) {
            console.error('Could not get ffmpeg version:', err);
          } else {
            console.log('ffmpeg version:', version);
          }
        });
      }
    });
  }
});
