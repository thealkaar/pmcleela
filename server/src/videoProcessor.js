const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const MAX_REEL_DURATION_SECONDS = 40;

const CROP_FILTERS = {
  '9:16': 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
  '1:1': 'scale=720:720:force_original_aspect_ratio=increase,crop=720:720',
  full: 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=black'
};

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    const process = spawn(ffmpegPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe']
    });
    let errorOutput = '';

    process.stderr.on('data', (chunk) => {
      if (errorOutput.length < 16000) {
        errorOutput += chunk.toString().slice(0, 16000 - errorOutput.length);
      }
    });
    process.once('error', reject);
    process.once('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        const error = new Error(`FFmpeg exited with code ${code}: ${errorOutput.trim() || 'unknown error'}`);
        error.statusCode = 422;
        reject(error);
      }
    });
  });
}

async function trimAndCropVideo(inputPath, { trimStart, trimEnd, cropMode = '9:16' }) {
  if (!ffmpegPath) {
    throw new Error('FFmpeg is unavailable. Reinstall the server dependencies before uploading reels.');
  }

  const start = Number(trimStart);
  const end = Number(trimEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    const error = new Error('The selected video trim range is invalid.');
    error.statusCode = 400;
    throw error;
  }
  if (end - start > MAX_REEL_DURATION_SECONDS) {
    const error = new Error(`A reel can be no longer than ${MAX_REEL_DURATION_SECONDS} seconds.`);
    error.statusCode = 400;
    throw error;
  }

  const filter = CROP_FILTERS[cropMode];
  if (!filter) {
    const error = new Error('The selected reel crop mode is not supported.');
    error.statusCode = 400;
    throw error;
  }

  const filename = `leela_trimmed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}.mp4`;
  const outputPath = path.join(path.dirname(inputPath), filename);
  const temporaryPath = `${outputPath}.processing.mp4`;

  try {
    await runFFmpeg([
      '-hide_banner',
      '-loglevel', 'error',
      '-y',
      '-filter_threads', '1',
      '-i', inputPath,
      '-ss', String(start),
      '-t', String(end - start),
      '-map', '0:v:0',
      '-map', '0:a?',
      '-vf', filter,
      '-c:v', 'libx264',
      '-threads', '2',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      temporaryPath
    ]);

    const outputStat = await fs.promises.stat(temporaryPath);
    if (!outputStat.size) {
      throw new Error('FFmpeg created an empty reel video.');
    }
    await fs.promises.rename(temporaryPath, outputPath);
    return { path: outputPath, duration: end - start };
  } catch (error) {
    await fs.promises.unlink(temporaryPath).catch(() => {});
    await fs.promises.unlink(outputPath).catch(() => {});
    throw error;
  }
}

module.exports = { trimAndCropVideo };
