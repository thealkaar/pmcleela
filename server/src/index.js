require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { randomInt, randomUUID } = require('crypto');
const multer = require('multer');
const { Server } = require('socket.io');

const Matchmaker = require('./matchmaker');
const { LocalDB } = require('./db');
const PrismaDB = require('./prismaDb');
const { sendOtpEmail, sendPasswordResetEmail } = require('./emailService');
const { trimAndCropVideo } = require('./videoProcessor');
const r2Storage = require('./r2Storage');
const { loginAdmin, requireAdmin } = require('./adminAuth');
const {
  issueUserToken,
  verifyUserToken,
  isSessionAuthConfigured,
  requireUser,
  optionalUser
} = require('./userAuth');
const { sendPushToAll } = require('./pushNotifications');

if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in production. Configure the Supabase PostgreSQL connection string.');
}
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.PMC_USER_SESSION_SECRET || process.env.PMC_USER_SESSION_SECRET.length < 32)
) {
  throw new Error('PMC_USER_SESSION_SECRET must be configured with at least 32 characters in production.');
}

const db = process.env.PMC_LOCAL_MODE === '1'
  ? new LocalDB()
  : process.env.DATABASE_URL
    ? new PrismaDB(LocalDB)
    : new LocalDB();
const app = express();
const server = http.createServer(app);

function publicUser(user, req) {
  if (!user) return user;
  const safeUser = { ...user };
  delete safeUser.password;
  delete safeUser.passwordHash;
  delete safeUser.fullName;
  delete safeUser.avatarUri;
  if (safeUser.avatarStorageKey) {
    const avatarPath = `/api/users/${encodeURIComponent(safeUser.id)}/avatar?v=${encodeURIComponent(safeUser.avatarStorageKey)}`;
    safeUser.avatarUrl = req ? `${req.protocol}://${req.get('host')}${avatarPath}` : avatarPath;
  } else if (safeUser.avatarUrl && !/^https?:\/\//i.test(safeUser.avatarUrl)) {
    safeUser.avatarUrl = null;
  }
  delete safeUser.avatarStorageKey;
  return safeUser;
}

async function withPlayableVideoUrl(reel, req) {
  if (reel.videoStorageKey) {
    return { ...reel, videoUrl: await r2Storage.getVideoUrl(reel.videoStorageKey) };
  }
  let videoUrl = reel.videoUrl;
  if (videoUrl && videoUrl.includes('/uploads/')) {
    const filename = videoUrl.split('/uploads/').pop();
    videoUrl = `${req.protocol}://${req.get('host')}/uploads/${filename}`;
  }
  return { ...reel, videoUrl };
}

async function removeReelFiles(deletion) {
  for (const key of deletion.deletedReelStorageKeys) {
    await r2Storage.deleteVideo(key);
  }
  for (const filename of deletion.deletedReelFiles) {
    const safeFilename = path.basename(filename);
    if (safeFilename !== filename) {
      throw new Error('Refusing to delete a reel file outside the uploads directory.');
    }
    await fs.promises.unlink(path.join(uploadsDir, safeFilename)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
}

app.set('trust proxy', 1);

// Video files are handled as multipart uploads below, not buffered by JSON parsing.
app.use(cors());
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '10mb';
app.use(express.json({ limit: jsonBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: jsonBodyLimit }));

// Local Video & Media Uploads Directory (stored right on the PC)
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
// Serve uploads folder with byte-range support for video streaming
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.setHeader('Accept-Ranges', 'bytes');
  }
}));

// Serve test companion client
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));
app.get('/.well-known/assetlinks.json', (req, res) => {
  const fingerprints = (process.env.ANDROID_APP_SHA256_CERT_FINGERPRINTS || '')
    .split(',')
    .map(fingerprint => fingerprint.trim())
    .filter(Boolean);
  if (!fingerprints.length) {
    return res.status(503).json({
      success: false,
      message: 'Android App Links are not verified. Configure ANDROID_APP_SHA256_CERT_FINGERPRINTS.'
    });
  }
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.pmcleela.app',
      sha256_cert_fingerprints: fingerprints
    }
  }]);
});
app.get('/reel/:id', async (req, res) => {
  try {
    const reels = await db.getReels();
    const reel = reels.find(item => String(item.id) === req.params.id);
    if (!reel) {
      return res.status(404).type('html').send(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reel unavailable</title></head><body><h1>Reel unavailable</h1><p>This reel may have been removed.</p></body></html>'
      );
    }

    const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
    const reelId = encodeURIComponent(reel.id);
    const shareUrl = `${req.protocol}://${req.get('host')}/reel/${reelId}`;
    const appUrl = `pmcleela://reel/${reelId}`;
    const title = `Watch ${reel.creatorName || 'a student'}'s reel on Leela`;
    const description = reel.caption || 'Open this campus reel in PMC Leela.';
    res.type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${escapeHtml(shareUrl)}">
  <meta name="twitter:card" content="summary">
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111827;color:#fff;font:16px system-ui,sans-serif}
    main{box-sizing:border-box;width:min(92%,480px);padding:32px;border:1px solid #374151;border-radius:20px;background:#1f2937}
    h1{font-size:24px;margin:0 0 12px}p{color:#d1d5db;line-height:1.5;overflow-wrap:anywhere}
    a{display:inline-block;margin-top:12px;padding:13px 20px;border-radius:12px;background:#ec4899;color:#fff;text-decoration:none;font-weight:700}
  </style>
</head>
<body><main>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <a href="${escapeHtml(appUrl)}">Open in PMC Leela</a>
</main></body>
</html>`);
  } catch (error) {
    console.error(`[Share] Could not load reel ${req.params.id}:`, error);
    res.status(500).type('html').send(
      '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reel unavailable</title></head><body><h1>Could not load this reel</h1><p>Please try the link again later.</p></body></html>'
    );
  }
});
app.get('/test', (req, res) => {
  res.sendFile(path.join(publicDir, 'test.html'));
});

const configuredUploadLimitMb = Number(process.env.MAX_UPLOAD_MB || 100);
if (!Number.isFinite(configuredUploadLimitMb) || configuredUploadLimitMb <= 0) {
  throw new Error('MAX_UPLOAD_MB must be a positive number.');
}
const maxUploadBytes = configuredUploadLimitMb * 1024 * 1024;

// Multer storage for local reels videos.
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    cb(null, `leela_${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: {
    fileSize: maxUploadBytes,
    fieldSize: 1024 * 1024
  }
});
const appReleaseUploadLimitMb = Number(process.env.MAX_APP_RELEASE_MB || 250);
if (!Number.isFinite(appReleaseUploadLimitMb) || appReleaseUploadLimitMb <= 0) {
  throw new Error('MAX_APP_RELEASE_MB must be a positive number.');
}
const appReleaseUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `pmc_release_${Date.now()}_${randomUUID()}.apk`)
  }),
  limits: { fileSize: appReleaseUploadLimitMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const isApk = path.extname(file.originalname).toLowerCase() === '.apk';
    const validType = [
      'application/vnd.android.package-archive',
      'application/octet-stream'
    ].includes(file.mimetype);
    cb(isApk && validType ? null : new Error('Choose a valid Android .apk file.'), isApk && validType);
  }
});
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => cb(null, `pmc_avatar_${randomUUID()}${path.extname(file.originalname).toLowerCase()}`)
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const validTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp'
    };
    const valid = validTypes[extension] === file.mimetype;
    cb(valid ? null : new Error('Choose a JPEG, PNG, or WebP profile image.'), valid);
  }
});

// Setup Socket.io for Piya Milan Chauraha
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const matchmaker = new Matchmaker(io);
const requireStudent = requireUser(db);
const allowOptionalStudent = optionalUser(db);

// Socket.io Events
io.use(async (socket, next) => {
  if (!isSessionAuthConfigured()) return next(new Error('Student sign-in is temporarily unavailable.'));
  const claims = verifyUserToken(socket.handshake.auth?.token);
  if (!claims) return next(new Error('Student sign-in is required.'));
  try {
    const user = await db.findUserById(claims.sub);
    if (!user) return next(new Error('Student account is unavailable.'));
    socket.data.studentUser = user;
    socket.data.userId = user.id;
    return next();
  } catch (error) {
    console.error('[Auth] Could not authenticate student chat socket:', error);
    return next(new Error('Could not verify student account.'));
  }
});

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  io.emit('online_stats', matchmaker.getOnlineStats());

  // Enqueue user with gender, anonymous alias, and academic year
  socket.on('search_partner', (data) => {
    const user = socket.data.studentUser;
    console.log(`[PMC] ${socket.id} searching partner for account ${user.id}`);
    matchmaker.enqueue(socket, {
      gender: user.gender || 'male',
      preferredAlias: user.anonymousName,
      academicYear: user.academicYear
    });
    io.emit('online_stats', matchmaker.getOnlineStats());
  });

  socket.on('send_message', (data) => {
    matchmaker.sendMessage(socket, data.text);
  });

  socket.on('send_image', (data) => {
    matchmaker.sendImage(socket, data.image);
  });

  socket.on('typing_status', (data) => {
    matchmaker.sendTyping(socket, data.isTyping);
  });

  socket.on('next_partner', (data) => {
    console.log(`[PMC] ${socket.id} skipped to next partner`);
    const user = socket.data.studentUser;
    matchmaker.next(socket, {
      gender: user.gender || 'male',
      preferredAlias: user.anonymousName,
      academicYear: user.academicYear
    });
    io.emit('online_stats', matchmaker.getOnlineStats());
  });

  socket.on('leave_chat', () => {
    matchmaker.leaveRoom(socket);
    io.emit('online_stats', matchmaker.getOnlineStats());
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    matchmaker.handleDisconnect(socket);
    io.emit('online_stats', matchmaker.getOnlineStats());
  });
});

// ================= REST API ROUTES =================

app.post('/api/admin/login', loginAdmin);

app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const [users, reels] = await Promise.all([db.getUsers(), db.getReels()]);
    const reelCounts = new Map();
    for (const reel of reels) {
      if (reel.creatorId) reelCounts.set(reel.creatorId, (reelCounts.get(reel.creatorId) || 0) + 1);
    }
    res.json({
      success: true,
      data: users.map(user => ({ ...publicUser(user, req), reelsCount: reelCounts.get(user.id) || 0 }))
    });
  } catch (error) {
    console.error('[Admin] Failed to list users:', error);
    res.status(500).json({ success: false, message: 'Could not load user accounts.' });
  }
});

app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { phone, email, password, gender, hostel, anonymousName, academicYear } = req.body || {};
    if (
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      typeof anonymousName !== 'string' ||
      password.length < 12
    ) {
      return res.status(400).json({
        success: false,
        message: 'MANIT email, campus name, and an initial password of at least 12 characters are required.'
      });
    }
    if (gender !== 'male' && gender !== 'female') {
      return res.status(400).json({ success: false, message: 'Choose a valid student gender.' });
    }
    const user = await db.registerVerifiedUser({
      phone: typeof phone === 'string' ? phone : '',
      email,
      password,
      gender,
      hostel: typeof hostel === 'string' ? hostel : '',
      anonymousName,
      academicYear: typeof academicYear === 'string' ? academicYear : ''
    });
    console.info(`[Admin] Created student account ${user.id}`);
    res.status(201).json({ success: true, data: publicUser(user, req) });
  } catch (error) {
    const validationError = /already registered|already taken|Only MANIT student emails|is required/i.test(error.message);
    console.error('[Admin] Failed to create user:', error.message);
    res.status(validationError ? 400 : 500).json({
      success: false,
      message: validationError ? error.message : 'Could not create the user account.'
    });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const reels = (await db.getReels()).filter(reel => reel.creatorId === req.params.id);
    const deletion = {
      deletedReelStorageKeys: reels.map(reel => reel.videoStorageKey).filter(Boolean),
      deletedReelFiles: reels.flatMap(reel => (
        reel.videoUrl?.includes('/uploads/')
          ? [reel.videoUrl.split('/uploads/').pop()]
          : []
      ))
    };
    await removeReelFiles(deletion);
    const result = await db.deleteUser(req.params.id);
    if (!result) return res.status(404).json({ success: false, message: 'User not found.' });
    console.warn(`[Admin] Deleted user account ${req.params.id} and ${reels.length} reels`);
    res.json({ success: true, deletedReels: reels.length });
  } catch (error) {
    console.error(`[Admin] Failed to delete user ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Could not fully remove this account and its content.' });
  }
});

app.get('/api/admin/reels', requireAdmin, async (req, res) => {
  try {
    const reels = await db.getReels();
    const data = await Promise.all(reels.map(reel => withPlayableVideoUrl(reel, req)));
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Admin] Failed to load reels:', error);
    res.status(500).json({ success: false, message: 'Could not load reel content.' });
  }
});

app.delete('/api/admin/reels/:id', requireAdmin, async (req, res) => {
  try {
    const reel = await db.getReel(req.params.id);
    if (!reel) return res.status(404).json({ success: false, message: 'Reel not found.' });
    const deletion = {
      deletedReelFiles: reel.videoUrl?.includes('/uploads/')
        ? [reel.videoUrl.split('/uploads/').pop()]
        : [],
      deletedReelStorageKeys: reel.videoStorageKey ? [reel.videoStorageKey] : []
    };
    await removeReelFiles(deletion);
    const result = await db.deleteReel(req.params.id);
    if (!result) return res.status(404).json({ success: false, message: 'Reel not found.' });
    console.warn(`[Admin] Deleted reel ${req.params.id} and its stored video`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[Admin] Failed to delete reel ${req.params.id}:`, error);
    res.status(502).json({
      success: false,
      message: 'Could not delete the reel from storage. Reel metadata was kept so deletion can be retried.'
    });
  }
});

app.get('/api/admin/reports', requireAdmin, async (req, res) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !['pending', 'resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Report status is invalid.' });
    }
    const reports = await db.getReelReports({ status });
    const data = await Promise.all(reports.map(async report => ({
      ...report,
      reel: report.reel ? await withPlayableVideoUrl(report.reel, req) : null,
      reporter: publicUser(report.reporter, req)
    })));
    res.json({ success: true, data });
  } catch (error) {
    console.error('[Admin] Failed to load reports:', error);
    res.status(500).json({ success: false, message: 'Could not load reel reports.' });
  }
});

app.patch('/api/admin/reports/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    if (!['resolved', 'dismissed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Report status must be resolved or dismissed.' });
    }
    const report = await db.updateReelReportStatus(req.params.id, status);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found.' });
    res.json({ success: true, data: report });
  } catch (error) {
    console.error(`[Admin] Failed to update report ${req.params.id}:`, error);
    res.status(500).json({ success: false, message: 'Could not update report status.' });
  }
});

app.get('/api/admin/announcements', requireAdmin, async (req, res) => {
  try {
    res.json({ success: true, data: await db.getAnnouncements(20) });
  } catch (error) {
    console.error('[Admin] Failed to list announcements:', error);
    res.status(500).json({ success: false, message: 'Could not load broadcast history.' });
  }
});

app.post('/api/admin/announcements', requireAdmin, async (req, res) => {
  try {
    const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!title || title.length > 80 || !message || message.length > 500) {
      return res.status(400).json({
        success: false,
        message: 'A title (1–80 characters) and message (1–500 characters) are required.'
      });
    }

    const announcement = await db.addAnnouncement({
      id: `announcement_${randomUUID()}`,
      title,
      message
    });
    let tokens = [];
    let delivery = { sent: 0, failed: 0, invalidTokens: [], errors: [] };
    try {
      tokens = await db.getPushTokens();
      delivery = await sendPushToAll(tokens, {
        title,
        body: message,
        data: { type: 'announcement', announcementId: announcement.id }
      });
      if (delivery.invalidTokens.length) {
        await db.removePushTokens(delivery.invalidTokens);
      }
    } catch (pushError) {
      delivery.failed = tokens.length;
      delivery.errors = [pushError.message];
      console.error('[Push] Announcement was saved, but push delivery could not be completed:', pushError);
    }
    console.info(`[Admin] Broadcast ${announcement.id}: ${delivery.sent} sent, ${delivery.failed} failed.`);
    res.status(201).json({
      success: true,
      data: announcement,
      delivery: {
        registeredDevices: new Set(tokens.map(item => item.token)).size,
        sent: delivery.sent,
        failed: delivery.failed,
        errors: delivery.errors
      }
    });
  } catch (error) {
    console.error('[Admin] Failed to send announcement:', error);
    res.status(500).json({ success: false, message: 'Could not publish the broadcast.' });
  }
});

app.post('/api/push/register', requireStudent, async (req, res) => {
  try {
    const { token, platform } = req.body || {};
    const validToken = typeof token === 'string' && /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
    if (!validToken || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'A valid Expo push token and platform are required.' });
    }
    const registration = await db.registerPushToken(req.studentUser.id, token, platform);
    if (!registration) return res.status(404).json({ success: false, message: 'Student account not found.' });
    res.json({ success: true });
  } catch (error) {
    console.error('[Push] Failed to register device token:', error);
    res.status(500).json({ success: false, message: 'Could not register this device for notifications.' });
  }
});

app.post('/api/push/unregister', requireStudent, async (req, res) => {
  try {
    const { token } = req.body || {};
    if (typeof token !== 'string' || !/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
      return res.status(400).json({ success: false, message: 'A valid Expo push token is required.' });
    }
    await db.removePushTokenForUser(req.studentUser.id, token);
    res.json({ success: true });
  } catch (error) {
    console.error('[Push] Failed to unregister device token:', error);
    res.status(500).json({ success: false, message: 'Could not unregister this device.' });
  }
});

app.get('/api/announcements', async (req, res) => {
  try {
    res.json({ success: true, data: await db.getAnnouncements() });
  } catch (error) {
    console.error('[Push] Failed to load announcements:', error);
    res.status(500).json({ success: false, message: 'Could not load announcements.' });
  }
});

app.get('/api/admin/app-releases', requireAdmin, async (req, res) => {
  try {
    const releases = await db.getAppReleases(10);
    res.json({
      success: true,
      data: releases.map(({ storageKey, ...release }) => release)
    });
  } catch (error) {
    console.error('[Admin] Failed to load app releases:', error);
    res.status(500).json({ success: false, message: 'Could not load app release history.' });
  }
});

app.post('/api/admin/app-releases', requireAdmin, (req, res) => {
  if (!r2Storage.isConfigured()) {
    return res.status(503).json({ success: false, message: 'Cloudflare R2 must be configured before publishing an APK.' });
  }

  appReleaseUpload.single('apk')(req, res, async (uploadError) => {
    if (uploadError) {
      const status = uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        success: false,
        message: status === 413
          ? `APK exceeds the ${appReleaseUploadLimitMb}MB upload limit.`
          : uploadError.message
      });
    }

    let storageKey = null;
    let releaseSaved = false;
    try {
      const versionName = typeof req.body?.versionName === 'string' ? req.body.versionName.trim() : '';
      const versionCode = Number(req.body?.versionCode);
      const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
      if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(versionName) ||
          !Number.isSafeInteger(versionCode) || versionCode < 1 ||
          notes.length > 1000 || !req.file) {
        return res.status(400).json({
          success: false,
          message: 'Provide a valid version (for example 1.2.0), a positive Android version code, release notes up to 1000 characters, and an APK.'
        });
      }

      const currentRelease = await db.getAppRelease();
      if (currentRelease && versionCode <= currentRelease.versionCode) {
        return res.status(409).json({
          success: false,
          message: `Version code must be greater than the latest published code (${currentRelease.versionCode}).`
        });
      }

      const handle = await fs.promises.open(req.file.path, 'r');
      const signature = Buffer.alloc(4);
      try {
        await handle.read(signature, 0, signature.length, 0);
      } finally {
        await handle.close();
      }
      if (signature.toString('hex') !== '504b0304') {
        return res.status(400).json({ success: false, message: 'The selected file is not a valid Android APK archive.' });
      }

      storageKey = await r2Storage.uploadAppRelease(req.file.path);
      const release = await db.addAppRelease({
        id: `release_${randomUUID()}`,
        versionName,
        versionCode,
        notes,
        storageKey
      });
      releaseSaved = true;
      let pushTokens = [];
      let delivery = { sent: 0, failed: 0, invalidTokens: [], errors: [] };
      try {
        pushTokens = await db.getPushTokens();
        delivery = await sendPushToAll(pushTokens, {
          title: 'PMC Leela update available',
          body: `Version ${versionName} is ready. Open Me in the app to install it.`,
          data: { type: 'app-update', versionCode }
        });
        if (delivery.invalidTokens.length) {
          await db.removePushTokens(delivery.invalidTokens);
        }
      } catch (pushError) {
        delivery.failed = pushTokens.length;
        delivery.errors = [pushError.message];
        console.error('[Push] APK release was saved, but push delivery could not be completed:', pushError);
      }
      const { storageKey: savedStorageKey, ...publicRelease } = release;
      console.info(`[Admin] Published Android release ${versionName} (${versionCode}).`);
      res.status(201).json({
        success: true,
        data: publicRelease,
        delivery: {
          registeredDevices: new Set(pushTokens.map(item => item.token)).size,
          sent: delivery.sent,
          failed: delivery.failed,
          errors: delivery.errors
        }
      });
    } catch (error) {
      if (storageKey && !releaseSaved) {
        await r2Storage.deleteVideo(storageKey).catch(cleanupError => {
          console.error('[Admin] Could not remove failed APK upload:', cleanupError);
        });
      }
      const duplicateVersion = error.code === 'P2002' || error.code === 'DUPLICATE_VERSION_CODE';
      console.error('[Admin] Failed to publish APK:', error);
      res.status(duplicateVersion ? 409 : 500).json({
        success: false,
        message: duplicateVersion ? 'This Android version code has already been published.' : 'Could not publish this APK.'
      });
    } finally {
      if (req.file?.path) {
        await fs.promises.unlink(req.file.path).catch(cleanupError => {
          if (cleanupError.code !== 'ENOENT') console.error('[Admin] Could not remove temporary APK:', cleanupError);
        });
      }
    }
  });
});

app.get('/api/app-release', async (req, res) => {
  try {
    const release = await db.getAppRelease();
    if (!release) return res.json({ success: true, data: null });
    const { storageKey, ...publicRelease } = release;
    res.json({
      success: true,
      data: {
        ...publicRelease,
        downloadUrl: await r2Storage.getVideoUrl(storageKey)
      }
    });
  } catch (error) {
    console.error('[App] Failed to load current release:', error);
    res.status(503).json({ success: false, message: 'Could not load the current app update.' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await db.checkConnection();
    res.json({
      status: 'ok',
      appName: 'पी एम सी Leela',
      college: 'MANIT Bhopal',
      serverTime: new Date().toISOString(),
      stats: matchmaker.getOnlineStats()
    });
  } catch (error) {
    console.error('[Health] Database connection failed:', error.message);
    res.status(503).json({ status: 'error', message: 'Database unavailable.' });
  }
});

// 1. STEP 1: SEND EMAIL OTP FOR VERIFICATION
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email, phone } = req.body;
    
    // Validate student college email: must end with @stu.manit.ac.in
    const validation = db.validateManitEmail(email);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    // Check if email already registered
    const existing = await db.findUserByEmail(validation.email);
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `This MANIT email (${validation.email}) is already registered. Please Log In directly.`
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store in DB OTP store
    db.saveOtp(validation.email, otp, {
      phone: (phone || '').trim(),
      scholarNo: validation.scholarNo
    });

    // Send via Brevo Transactional Email Service
    const emailResult = await sendOtpEmail(validation.email, otp);

    if (!emailResult.success && emailResult.error) {
      return res.status(500).json({
        success: false,
        message: `Could not send verification email: ${emailResult.error}. Please try again.`
      });
    }

    res.json({
      success: true,
      message: `A 6-digit verification OTP has been dispatched to ${validation.email}. Please check your inbox / spam folder.`,
      email: validation.email,
      scholarNo: validation.scholarNo
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  const genericResponse = {
    success: true,
    message: 'If an account exists for that MANIT email, a password reset code will be sent shortly. Check your inbox and spam folder.'
  };
  try {
    const validation = db.validateManitEmail(req.body?.email);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    const user = await db.findUserByEmail(validation.email);
    if (user) {
      const otp = String(randomInt(100000, 1000000));
      if (!db.savePasswordResetOtp(validation.email, otp)) {
        return res.status(429).json({
          success: false,
          message: 'Please wait one minute before requesting another password reset code.'
        });
      }

      const emailResult = await sendPasswordResetEmail(validation.email, otp);
      if (!emailResult.success) {
        db.clearPasswordResetOtp(validation.email);
        console.error(`[Auth] Password reset email could not be sent: ${emailResult.error || 'unknown email service error'}`);
        return res.status(503).json({
          success: false,
          message: 'Password reset email could not be sent right now. Please try again later or contact support.'
        });
      }
    }
    res.json(genericResponse);
  } catch (error) {
    console.error('[Auth] Could not process password reset request:', error);
    res.status(503).json({
      success: false,
      message: 'Password reset email could not be sent right now. Please try again later or contact support.'
    });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    const validation = db.validateManitEmail(email);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }
    if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, message: 'Enter the 6-digit password reset code.' });
    }
    if (typeof newPassword !== 'string' || newPassword.trim().length < 6 || newPassword.length > 128) {
      return res.status(400).json({ success: false, message: 'New password must be between 6 and 128 characters.' });
    }

    const verification = db.verifyPasswordResetOtp(validation.email, otp);
    if (!verification.success) {
      return res.status(400).json({ success: false, message: verification.message });
    }
    const updatedUser = await db.updatePasswordByEmail(validation.email, newPassword.trim());
    if (!updatedUser) {
      return res.status(400).json({
        success: false,
        message: 'The reset code is invalid or expired. Request a new code and try again.'
      });
    }
    res.json({ success: true, message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (error) {
    console.error('[Auth] Could not reset password:', error);
    res.status(500).json({ success: false, message: 'Could not reset password. Please request a new code and try again.' });
  }
});

// 2. STEP 2: VERIFY OTP AND REGISTER ACCOUNT
app.post('/api/auth/verify-and-register', async (req, res) => {
  try {
    if (!isSessionAuthConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Student sign-in is temporarily unavailable. Please contact the app administrator.'
      });
    }
    const { email, otp, phone, password, gender, academicYear, hostel, anonymousName } = req.body;
    
    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and 6-digit OTP are required.'
      });
    }

    if (!password || !gender || !anonymousName) {
      return res.status(400).json({
        success: false,
        message: 'Password, gender, and anonymous persona name are required.'
      });
    }

    // Verify OTP code
    const otpResult = db.verifyOtp(email, otp);
    if (!otpResult.success) {
      return res.status(400).json({
        success: false,
        message: otpResult.message
      });
    }

    // Register user
    const newUser = await db.registerVerifiedUser({
      phone: phone || otpResult.studentData?.phone || '',
      email,
      password,
      gender,
      academicYear,
      hostel,
      anonymousName
    });

    res.status(201).json({
      success: true,
      message: 'Email verified! Account created successfully. Welcome to पी एम सी Leela.',
      user: publicUser(newUser, req),
      token: issueUserToken(newUser.id)
    });
  } catch (err) {
    console.error('Verify & Register error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// 3. LEGACY / DIRECT REGISTER (Fallback with automatic validation)
app.post('/api/auth/register', async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Direct registration is disabled. Use the verified student registration flow.'
  });
});

// 4. LOGIN STUDENT ACCOUNT (Using Email OR Scholar No OR Anonymous Name + Password)
app.post('/api/auth/login', async (req, res) => {
  try {
    if (!isSessionAuthConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Student sign-in is temporarily unavailable. Please contact the app administrator.'
      });
    }
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your Email/Scholar No/Anonymous Name and Password.'
      });
    }

    const user = await db.loginUser(identifier, password);
    res.json({
      success: true,
      message: 'Logged in successfully!',
      user: publicUser(user, req),
      token: issueUserToken(user.id)
    });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
});

app.get('/api/users/:userId/avatar', async (req, res) => {
  try {
    const user = await db.findUserById(req.params.userId);
    if (!user) return res.status(404).end();
    if (!user.avatarStorageKey) {
      if (typeof user.avatarUrl === 'string' && /^https?:\/\//i.test(user.avatarUrl)) {
        return res.redirect(302, user.avatarUrl);
      }
      return res.status(404).end();
    }

    const avatarUrl = await r2Storage.getAvatarUrl(user.avatarStorageKey);
    res.set('Cache-Control', 'private, max-age=300');
    return res.redirect(302, avatarUrl);
  } catch (error) {
    console.error('[Profile] Could not load avatar:', error);
    return res.status(500).end();
  }
});

app.post('/api/auth/avatar', requireStudent, (req, res) => {
  if (!r2Storage.isConfigured()) {
    return res.status(503).json({ success: false, message: 'Cloudflare R2 must be configured before uploading a profile image.' });
  }

  avatarUpload.single('avatar')(req, res, async (uploadError) => {
    if (uploadError) {
      const tooLarge = uploadError instanceof multer.MulterError && uploadError.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        message: tooLarge ? 'Profile images must be 5 MB or smaller.' : uploadError.message
      });
    }

    let uploadedStorageKey = null;
    try {
      const userId = req.studentUser.id;
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'A profile image is required.' });
      }

      const currentUser = await db.findUserById(userId);
      if (!currentUser) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      uploadedStorageKey = await r2Storage.uploadAvatar(req.file.path, req.file.mimetype);
      const updatedUser = await db.updateUserAvatar(userId, uploadedStorageKey);
      if (!updatedUser) {
        await r2Storage.deleteAvatar(uploadedStorageKey);
        uploadedStorageKey = null;
        return res.status(404).json({ success: false, message: 'User not found.' });
      }

      const previousStorageKey = currentUser.avatarStorageKey;
      uploadedStorageKey = null;
      if (previousStorageKey && previousStorageKey !== updatedUser.avatarStorageKey) {
        await r2Storage.deleteAvatar(previousStorageKey).catch((cleanupError) => {
          console.error('[Profile] Could not remove replaced avatar:', cleanupError);
        });
      }

      return res.json({ success: true, user: publicUser(updatedUser, req) });
    } catch (error) {
      console.error('[Profile] Avatar upload failed:', error);
      if (uploadedStorageKey) {
        await r2Storage.deleteAvatar(uploadedStorageKey).catch((cleanupError) => {
          console.error('[Profile] Could not remove failed avatar upload:', cleanupError);
        });
      }
      return res.status(500).json({ success: false, message: 'Could not save the profile image.' });
    } finally {
      if (req.file?.path) {
        await fs.promises.unlink(req.file.path).catch((cleanupError) => {
          if (cleanupError.code !== 'ENOENT') console.error('[Profile] Could not remove temporary avatar:', cleanupError);
        });
      }
    }
  });
});

// 5. UPDATE ANONYMOUS PERSONA
app.post('/api/auth/update-persona', requireStudent, async (req, res) => {
  try {
    const { newAnonymousName } = req.body || {};
    const userId = req.studentUser.id;
    if (!newAnonymousName) {
      return res.status(400).json({ success: false, message: 'A new anonymous name is required.' });
    }
    const updatedUser = await db.updateUserPersona(userId, newAnonymousName);
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, user: publicUser(updatedUser, req) });
  } catch (err) {
    const duplicateName = /anonymous persona name is already taken/i.test(err.message);
    const invalidName = /anonymous persona name is required/i.test(err.message);
    if (!duplicateName && !invalidName) {
      console.error('[Profile] Failed to update anonymous persona:', err);
    }
    res.status(duplicateName || invalidName ? 400 : 500).json({ success: false, message: err.message });
  }
});

// 6. DELETE USER ACCOUNT & ALL ASSOCIATED DATA
app.delete('/api/auth/delete-account', requireStudent, async (req, res) => {
  try {
    const userId = req.studentUser.id;

    const result = await db.deleteUser(userId);
    if (!result) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Delete associated reel video files from disk
    for (const filename of result.deletedReelFiles) {
      const filePath = path.join(uploadsDir, filename);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`[Cleanup] Deleted reel file: ${filename}`);
        }
      } catch (fileErr) {
        console.error(`[Cleanup] Failed to delete file ${filename}:`, fileErr.message);
      }
    }

    const failedStorageDeletions = [];
    if (result.deletedUser.avatarStorageKey) {
      try {
        await r2Storage.deleteAvatar(result.deletedUser.avatarStorageKey);
      } catch (storageErr) {
        failedStorageDeletions.push(result.deletedUser.avatarStorageKey);
        console.error('[Cleanup] Failed to delete R2 profile image:', storageErr.message);
      }
    }
    for (const key of result.deletedReelStorageKeys) {
      try {
        await r2Storage.deleteVideo(key);
      } catch (storageErr) {
        failedStorageDeletions.push(key);
        console.error(`[Cleanup] Failed to delete R2 reel object ${key}:`, storageErr.message);
      }
    }

    console.log(`[Account] Deleted user ${result.deletedUser.anonymousName} (${result.deletedUser.email}), removed ${result.deletedReelFiles.length} local reel files and ${result.deletedReelStorageKeys.length + Number(Boolean(result.deletedUser.avatarStorageKey)) - failedStorageDeletions.length} R2 objects`);

    res.status(failedStorageDeletions.length ? 502 : 200).json({
      success: failedStorageDeletions.length === 0,
      message: failedStorageDeletions.length
        ? 'Your account was deleted, but some profile or reel images could not be removed from storage.'
        : 'Your account and all associated data have been permanently deleted.',
      deletedReels: result.deletedReelFiles.length + result.deletedReelStorageKeys.length - failedStorageDeletions.length
    });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. GET LEELA REELS FEED
app.get('/api/reels', allowOptionalStudent, async (req, res) => {
  try {
    const host = req.get('host');
    const protocol = req.protocol;
    const userId = req.studentUser?.id;
    const rawReels = await db.getReels(userId);
    const reels = await Promise.all(rawReels.map(async (r) => {
      if (r.videoStorageKey) {
        return { ...r, videoUrl: await r2Storage.getVideoUrl(r.videoStorageKey) };
      }
      let url = r.videoUrl;
      if (url && url.includes('/uploads/')) {
        const filename = url.split('/uploads/').pop();
        url = `${protocol}://${host}/uploads/${filename}`;
      }
      return { ...r, videoUrl: url };
    }));
    res.json({ success: true, count: reels.length, data: reels });
  } catch (err) {
    console.error('Reel feed error:', err);
    res.status(500).json({ success: false, message: 'Could not load reels.' });
  }
});

// 8. UPLOAD REEL TO CONFIGURED STORAGE
app.post('/api/reels/upload', requireStudent, (req, res) => {
  if (process.env.NODE_ENV === 'production' && !r2Storage.isConfigured()) {
    console.error(
      `[Leela] Rejecting reel upload: missing R2 environment variables: ${r2Storage.getMissingConfig().join(', ')}`
    );
    return res.status(503).json({
      success: false,
      message: 'Reel storage is not configured. Please contact the app administrator.'
    });
  }

  upload.single('video')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          message: `Video file exceeds the ${configuredUploadLimitMb}MB limit. Please trim or select a shorter clip.`
        });
      }
      return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ success: false, message: `Upload error: ${err.message}` });
    }

    let uploadedPath = req.file?.path;
    let uploadedStorageKey = null;
    let uploadContentType = req.file?.mimetype || 'video/mp4';
    try {
      const { caption, audioTitle, tags, trimStart, trimEnd, cropMode } = req.body;
      const creatorId = req.studentUser.id;
      const creatorName = req.studentUser.anonymousName;
      const creatorYear = req.studentUser.academicYear;
      let videoUrl = req.body.videoUrl;

      if (!uploadedPath) {
        const error = new Error('A video file is required.');
        error.statusCode = 400;
        throw error;
      }

      const hasTrimStart = trimStart !== undefined && trimStart !== '';
      const hasTrimEnd = trimEnd !== undefined && trimEnd !== '';
      if (hasTrimStart !== hasTrimEnd) {
        const error = new Error('Both trimStart and trimEnd are required to process a trimmed reel.');
        error.statusCode = 400;
        throw error;
      }
      if (!hasTrimStart) {
        const error = new Error('Select a trim range of up to 40 seconds before uploading.');
        error.statusCode = 400;
        throw error;
      }

      if (uploadedPath && hasTrimStart && hasTrimEnd) {
        const processedVideo = await trimAndCropVideo(uploadedPath, {
          trimStart,
          trimEnd,
          cropMode: cropMode || '9:16'
        });
        uploadContentType = 'video/mp4';
        await fs.promises.unlink(uploadedPath).catch((cleanupError) => {
          if (cleanupError.code !== 'ENOENT') {
            console.error('Could not remove original reel upload:', cleanupError);
          }
        });
        uploadedPath = processedVideo.path;
      }

      if (uploadedPath) {
        if (r2Storage.isConfigured()) {
          uploadedStorageKey = await r2Storage.uploadVideo(uploadedPath, uploadContentType);
          await fs.promises.unlink(uploadedPath);
          uploadedPath = null;
        } else {
          const host = req.get('host');
          const protocol = req.protocol;
          videoUrl = `${protocol}://${host}/uploads/${path.basename(uploadedPath)}`;
        }
      }

      if (!videoUrl && !uploadedStorageKey) {
        return res.status(400).json({ success: false, message: 'Video file is required.' });
      }

      const signedVideoUrl = uploadedStorageKey
        ? await r2Storage.getVideoUrl(uploadedStorageKey)
        : null;
      const newReel = await db.addReel({
        creatorId,
        creatorName: creatorName || 'Campus Creator',
        creatorYear: creatorYear || 'Student',
        caption: caption || 'Campus vibes on Leela',
        videoUrl,
        videoStorageKey: uploadedStorageKey,
        audioTitle: audioTitle || 'Original Audio',
        tags: typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : (tags || ['#PMC', '#MANIT', '#Leela']),
        trimStart: trimStart || 0,
        trimEnd: trimEnd || 0,
        cropMode: cropMode || '9:16'
      });

      const announcementId = `reel_${newReel.id}`;
      const reelCaption = newReel.caption || 'A new campus reel is available.';
      let notificationCreatorName = newReel.creatorName || 'A student';
      try {
        const creator = creatorId ? await db.findUserById(creatorId) : null;
        notificationCreatorName = creator?.anonymousName || notificationCreatorName;
        await db.addAnnouncement({
          id: announcementId,
          title: `New reel by ${notificationCreatorName}`,
          message: reelCaption
        });
      } catch (notificationError) {
        console.error(`[Push] Reel ${newReel.id} was published, but its notification could not be saved:`, notificationError);
      }

      try {
        const pushTokens = await db.getPushTokens();
        const delivery = await sendPushToAll(pushTokens, {
          title: 'New reel on Leela',
          body: `${notificationCreatorName}: ${reelCaption}`.slice(0, 180),
          data: { type: 'reel', reelId: newReel.id }
        });
        if (delivery.invalidTokens.length) {
          await db.removePushTokens(delivery.invalidTokens);
        }
        console.info(`[Push] New reel ${newReel.id}: ${delivery.sent} sent, ${delivery.failed} failed.`);
      } catch (pushError) {
        console.error(`[Push] Reel ${newReel.id} was published, but push delivery could not be completed:`, pushError);
      }

      console.log(`[Leela] New reel stored: ${newReel.id} by ${creatorName} (${creatorYear})`);
      res.status(201).json({
        success: true,
        data: signedVideoUrl ? { ...newReel, videoUrl: signedVideoUrl } : newReel
      });
    } catch (saveErr) {
      console.error('Reel upload error:', saveErr);
      if (uploadedStorageKey) {
        await r2Storage.deleteVideo(uploadedStorageKey).catch((cleanupError) => {
          console.error('Could not remove failed R2 reel upload:', cleanupError);
        });
      }
      if (uploadedPath) {
        await fs.promises.unlink(uploadedPath).catch((cleanupError) => {
          if (cleanupError.code !== 'ENOENT') {
            console.error('Could not remove failed reel upload:', cleanupError);
          }
        });
      }
      res.status(saveErr.statusCode || 500).json({ success: false, message: saveErr.message });
    }
  });
});

// 8. TOGGLE LIKE ON REEL
app.post('/api/reels/:id/like', requireStudent, async (req, res) => {
  try {
    const userId = req.studentUser.id;
    const updatedReel = await db.toggleLike(req.params.id, userId);
    if (!updatedReel) {
      return res.status(404).json({ success: false, message: 'Reel not found.' });
    }
    res.json({ success: true, data: updatedReel });
  } catch (error) {
    console.error('Reel like error:', error);
    res.status(500).json({ success: false, message: 'Could not update reel like.' });
  }
});

app.post('/api/reels/:id/report', requireStudent, async (req, res) => {
  try {
    const reporterId = req.studentUser.id;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    const validReasons = [
      'Harassment or bullying',
      'Explicit content',
      'Hate or discrimination',
      'Spam or misleading',
      'Other'
    ];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ success: false, message: 'Select a valid report reason.' });
    }
    const report = await db.addReelReport(req.params.id, reporterId, reason);
    if (!report) return res.status(404).json({ success: false, message: 'Reel or account not found.' });
    if (report.duplicate) {
      return res.status(409).json({ success: false, message: 'You have already reported this reel.' });
    }
    res.status(201).json({ success: true, message: 'Report sent to the PMC moderation team.' });
  } catch (error) {
    console.error('[Reels] Failed to record reel report:', error);
    res.status(500).json({ success: false, message: 'Could not submit this report.' });
  }
});

// 9. POST COMMENT ON REEL
app.post('/api/reels/:id/comments', requireStudent, async (req, res) => {
  try {
    const { text } = req.body || {};
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      return res.status(400).json({ success: false, message: 'Comment text is required.' });
    }
    if (cleanText.length > 1000) {
      return res.status(400).json({ success: false, message: 'Comments cannot exceed 1,000 characters.' });
    }
    const comment = await db.addComment(
      req.params.id,
      req.studentUser.anonymousName,
      cleanText,
      req.studentUser.academicYear
    );
    if (!comment) {
      return res.status(404).json({ success: false, message: 'Reel not found.' });
    }
    const commentsCount = await db.countReelComments(req.params.id);
    res.json({ success: true, data: comment, commentsCount });
  } catch (error) {
    console.error('Reel comment error:', error);
    res.status(500).json({ success: false, message: 'Could not save reel comment.' });
  }
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('[Global Error]', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
  }
  res.status(500).json({ success: false, message: err.message || 'Internal Server Error' });
});

const PORT = process.env.PORT || 5000;
db.initialize().then(() => server.listen(PORT, '0.0.0.0', () => {
  console.log(`===================================================`);
  console.log(`🚀 पी एम सी Leela Server Active on port ${PORT}`);
  console.log(`💾 Metadata database: ${process.env.DATABASE_URL ? 'Supabase PostgreSQL' : 'local JSON'}`);
  console.log(`🛡️ MANIT Email OTP Verification: Active (domain: @stu.manit.ac.in)`);
  console.log(`❤️ Piya Milan Chauraha: Socket.io Matchmaker Active`);
  console.log(`🎬 Leela Reels: Video storage ${r2Storage.isConfigured() ? 'Cloudflare R2' : 'local disk'}`);
  console.log(`===================================================`);
})).catch((error) => {
  console.error('[Startup] Database initialization failed:', error);
  db.close().catch((closeError) => {
    console.error('[Startup] Failed to close database pool:', closeError.message);
  });
  process.exitCode = 1;
});
