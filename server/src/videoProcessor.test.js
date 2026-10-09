const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ffmpegPath = require('ffmpeg-static');
const { trimAndCropVideo } = require('./videoProcessor');

function createTestDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pmcleela-video-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function runFFmpeg(args) {
  const result = spawnSync(ffmpegPath, args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
}

function createVideo(filePath, withAudio) {
  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'lavfi',
    '-i', 'color=c=blue:s=160x120:r=15:d=2'
  ];
  if (withAudio) {
    args.push('-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:duration=2');
  }
  args.push('-map', '0:v:0', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p');
  if (withAudio) args.push('-map', '1:a:0', '-c:a', 'aac');
  args.push(filePath);
  runFFmpeg(args);
}

function hasAudio(filePath) {
  const result = spawnSync(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', filePath,
    '-map', '0:a:0',
    '-frames:a', '1',
    '-f', 'null',
    '-'
  ], { encoding: 'utf8' });
  return result.status === 0;
}

function getBandMeanVolume(filePath, frequency) {
  const result = spawnSync(ffmpegPath, [
    '-hide_banner',
    '-i', filePath,
    '-af', `bandpass=f=${frequency}:w=200,volumedetect`,
    '-f', 'null',
    '-'
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  const match = result.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  assert.ok(match, 'FFmpeg should report the filtered audio volume.');
  return Number(match[1]);
}

test('trimAndCropVideo mixes selected music when the source has no audio', {
  skip: !ffmpegPath
}, async (t) => {
  const directory = createTestDirectory(t);

  const silentVideo = path.join(directory, 'silent.mp4');
  const music = path.join(directory, 'music.m4a');
  createVideo(silentVideo, false);
  runFFmpeg([
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=880:sample_rate=44100:duration=1',
    '-c:a', 'aac',
    music
  ]);

  const result = await trimAndCropVideo(silentVideo, {
    trimStart: 0.2,
    trimEnd: 1.2,
    cropMode: '1:1',
    audioPath: music
  });

  assert.ok(fs.statSync(result.path).size > 0);
  assert.equal(result.duration, 1);
  assert.equal(hasAudio(result.path), true);
  assert.ok(getBandMeanVolume(result.path, 880) > -24, 'Selected music should remain clearly audible.');
});

test('trimAndCropVideo mixes selected music with source audio', {
  skip: !ffmpegPath
}, async (t) => {
  const directory = createTestDirectory(t);

  const sourceVideo = path.join(directory, 'with-audio.mp4');
  const music = path.join(directory, 'music.m4a');
  createVideo(sourceVideo, true);
  runFFmpeg([
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=880:sample_rate=44100:duration=1',
    '-c:a', 'aac',
    music
  ]);

  const result = await trimAndCropVideo(sourceVideo, {
    trimStart: 0.2,
    trimEnd: 1.2,
    cropMode: '9:16',
    audioPath: music
  });

  assert.ok(fs.statSync(result.path).size > 0);
  assert.equal(result.duration, 1);
  assert.equal(hasAudio(result.path), true);
  const musicMeanVolume = getBandMeanVolume(result.path, 880);
  assert.ok(musicMeanVolume > -24, `Selected music should remain clearly audible; got ${musicMeanVolume} dB.`);
});

test('trimAndCropVideo mutes source audio without muting selected music', {
  skip: !ffmpegPath
}, async (t) => {
  const directory = createTestDirectory(t);
  const sourceVideo = path.join(directory, 'with-audio.mp4');
  const music = path.join(directory, 'music.m4a');
  createVideo(sourceVideo, true);
  runFFmpeg([
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=880:sample_rate=44100:duration=1',
    '-c:a', 'aac',
    music
  ]);

  const result = await trimAndCropVideo(sourceVideo, {
    trimStart: 0.2,
    trimEnd: 1.2,
    cropMode: '9:16',
    audioPath: music,
    muteOriginalAudio: true
  });

  const musicMeanVolume = getBandMeanVolume(result.path, 880);
  const sourceMeanVolume = getBandMeanVolume(result.path, 220);
  assert.ok(musicMeanVolume > -24, `Selected music should remain audible; got ${musicMeanVolume} dB.`);
  assert.ok(sourceMeanVolume < -50, `Muted source audio should be absent; got ${sourceMeanVolume} dB.`);
});

test('trimAndCropVideo removes source audio when muted and no external music is selected', {
  skip: !ffmpegPath
}, async (t) => {
  const directory = createTestDirectory(t);
  const sourceVideo = path.join(directory, 'with-audio.mp4');
  createVideo(sourceVideo, true);

  const result = await trimAndCropVideo(sourceVideo, {
    trimStart: 0.2,
    trimEnd: 1.2,
    cropMode: '9:16',
    muteOriginalAudio: true
  });

  assert.equal(hasAudio(result.path), false);
});

test('trimAndCropVideo honors audio modes and the selected music offset', {
  skip: !ffmpegPath
}, async (t) => {
  const directory = createTestDirectory(t);
  const sourceVideo = path.join(directory, 'with-audio.mp4');
  const music = path.join(directory, 'two-sections.m4a');
  createVideo(sourceVideo, true);
  runFFmpeg([
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-f', 'lavfi',
    '-i', 'sine=frequency=440:sample_rate=44100:duration=1',
    '-f', 'lavfi',
    '-i', 'sine=frequency=880:sample_rate=44100:duration=1',
    '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1[music]',
    '-map', '[music]',
    '-c:a', 'aac',
    music
  ]);

  const original = await trimAndCropVideo(sourceVideo, {
    trimStart: 0,
    trimEnd: 1,
    audioPath: music,
    audioMode: 'original'
  });
  assert.ok(getBandMeanVolume(original.path, 220) > -24);
  assert.ok(getBandMeanVolume(original.path, 880) < -50);

  const musicOnly = await trimAndCropVideo(sourceVideo, {
    trimStart: 0,
    trimEnd: 1,
    audioPath: music,
    audioStart: 1,
    audioMode: 'music'
  });
  assert.ok(getBandMeanVolume(musicOnly.path, 880) > -24);
  const firstSectionVolume = getBandMeanVolume(musicOnly.path, 440);
  const sourceVolumeInMusicOnly = getBandMeanVolume(musicOnly.path, 220);
  assert.ok(firstSectionVolume < -50, `The unselected first music section should be absent; got ${firstSectionVolume} dB.`);
  assert.ok(sourceVolumeInMusicOnly < -50, `Original audio should be absent; got ${sourceVolumeInMusicOnly} dB.`);

  const both = await trimAndCropVideo(sourceVideo, {
    trimStart: 0,
    trimEnd: 1,
    audioPath: music,
    audioStart: 1,
    audioMode: 'both'
  });
  assert.ok(getBandMeanVolume(both.path, 880) > -24);
  assert.ok(getBandMeanVolume(both.path, 220) > -40);

  const muted = await trimAndCropVideo(sourceVideo, {
    trimStart: 0,
    trimEnd: 1,
    audioPath: music,
    audioMode: 'muted'
  });
  assert.equal(hasAudio(muted.path), false);
});
