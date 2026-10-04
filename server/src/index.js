require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const Matchmaker = require('./matchmaker');
const { LocalDB } = require('./db');
const PrismaDB = require('./prismaDb');
const { sendOtpEmail } = require('./emailService');
const { trimAndCropVideo } = require('./videoProcessor');
const r2Storage = require('./r2Storage');

if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in production. Configure the Supabase PostgreSQL connection string.');
}

const db = process.env.DATABASE_URL ? new PrismaDB(LocalDB) : new LocalDB();
const app = express();
const server = http.createServer(app);

function publicUser(user) {
  if (!user) return user;
  const { password, passwordHash, ...safeUser } = user;
  return safeUser;
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

// Setup Socket.io for Piya Milan Chauraha
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const matchmaker = new Matchmaker(io);

// Socket.io Events
io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);
  const authenticatedUserId = socket.handshake.auth?.userId;
  if (typeof authenticatedUserId === 'string' && authenticatedUserId.length > 0) {
    socket.data.userId = authenticatedUserId;
  }

  io.emit('online_stats', matchmaker.getOnlineStats());

  // Enqueue user with gender, anonymous alias, and academic year
  socket.on('search_partner', (data) => {
    console.log(`[PMC] ${socket.id} searching partner, gender: ${data?.gender}, alias: ${data?.preferredAlias}, year: ${data?.academicYear}`);
    matchmaker.enqueue(socket, {
      gender: data?.gender || 'male',
      preferredAlias: data?.preferredAlias,
      academicYear: data?.academicYear
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
    matchmaker.next(socket, {
      gender: data?.gender || 'male',
      preferredAlias: data?.preferredAlias,
      academicYear: data?.academicYear
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
    const { email, fullName, phone } = req.body;
    
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
      fullName: (fullName || 'MANIT Student').trim(),
      phone: (phone || '').trim(),
      scholarNo: validation.scholarNo
    });

    // Send via Brevo Transactional Email Service
    const emailResult = await sendOtpEmail(validation.email, otp, fullName || 'MANIT Scholar');

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

// 2. STEP 2: VERIFY OTP AND REGISTER ACCOUNT
app.post('/api/auth/verify-and-register', async (req, res) => {
  try {
    const { email, otp, fullName, phone, password, gender, academicYear, hostel, anonymousName, avatarUrl } = req.body;
    
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
      fullName: fullName || otpResult.studentData?.fullName || 'MANIT Student',
      phone: phone || otpResult.studentData?.phone || '',
      email,
      password,
      gender,
      academicYear,
      hostel,
      anonymousName,
      avatarUrl
    });

    res.status(201).json({
      success: true,
      message: 'Email verified! Account created successfully. Welcome to पी एम सी Leela.',
      user: publicUser(newUser),
      token: `tok_${Date.now()}_${newUser.id}`
    });
  } catch (err) {
    console.error('Verify & Register error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// 3. LEGACY / DIRECT REGISTER (Fallback with automatic validation)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, fullName, phone, gender, academicYear, hostel, anonymousName, avatarUrl } = req.body;
    if (!email || !password || !gender || !anonymousName) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, gender, and anonymous name are required.'
      });
    }

    const newUser = await db.registerUser({
      email,
      password,
      fullName,
      phone,
      gender,
      academicYear,
      hostel,
      anonymousName,
      avatarUrl
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully! Welcome to पी एम सी Leela.',
      user: publicUser(newUser),
      token: `tok_${Date.now()}_${newUser.id}`
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 4. LOGIN STUDENT ACCOUNT (Using Email OR Scholar No OR Anonymous Name + Password)
app.post('/api/auth/login', async (req, res) => {
  try {
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
      user: publicUser(user),
      token: `tok_${Date.now()}_${user.id}`
    });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
});

// 5. UPDATE ANONYMOUS PERSONA
app.post('/api/auth/update-persona', async (req, res) => {
  try {
    const { userId, newAnonymousName } = req.body;
    if (!userId || !newAnonymousName) {
      return res.status(400).json({ success: false, message: 'User ID and new anonymous name required.' });
    }
    const updatedUser = await db.updateUserPersona(userId, newAnonymousName);
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, user: publicUser(updatedUser) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. DELETE USER ACCOUNT & ALL ASSOCIATED DATA
app.delete('/api/auth/delete-account', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

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
    for (const key of result.deletedReelStorageKeys) {
      try {
        await r2Storage.deleteVideo(key);
      } catch (storageErr) {
        failedStorageDeletions.push(key);
        console.error(`[Cleanup] Failed to delete R2 reel object ${key}:`, storageErr.message);
      }
    }

    console.log(`[Account] Deleted user ${result.deletedUser.anonymousName} (${result.deletedUser.email}), removed ${result.deletedReelFiles.length} local reel files and ${result.deletedReelStorageKeys.length - failedStorageDeletions.length} R2 reel objects`);

    res.status(failedStorageDeletions.length ? 502 : 200).json({
      success: failedStorageDeletions.length === 0,
      message: failedStorageDeletions.length
        ? 'Your account was deleted, but some reel videos could not be removed from storage.'
        : 'Your account and all associated data have been permanently deleted.',
      deletedReels: result.deletedReelFiles.length + result.deletedReelStorageKeys.length - failedStorageDeletions.length
    });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. GET LEELA REELS FEED
app.get('/api/reels', async (req, res) => {
  try {
    const host = req.get('host');
    const protocol = req.protocol;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
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
app.post('/api/reels/upload', (req, res) => {
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
      const { creatorName, creatorYear, caption, audioTitle, tags, creatorId, trimStart, trimEnd, cropMode } = req.body;
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
app.post('/api/reels/:id/like', async (req, res) => {
  try {
    const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    if (!userId) {
      return res.status(400).json({ success: false, message: 'A user ID is required to like a reel.' });
    }
    if (!(await db.findUserById(userId))) {
      return res.status(404).json({ success: false, message: 'User account not found.' });
    }
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

// 9. POST COMMENT ON REEL
app.post('/api/reels/:id/comments', async (req, res) => {
  try {
    const { user, text, userYear } = req.body || {};
    const cleanText = typeof text === 'string' ? text.trim() : '';
    if (!cleanText) {
      return res.status(400).json({ success: false, message: 'Comment text is required.' });
    }
    if (cleanText.length > 1000) {
      return res.status(400).json({ success: false, message: 'Comments cannot exceed 1,000 characters.' });
    }
    const comment = await db.addComment(req.params.id, user, cleanText, userYear);
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
