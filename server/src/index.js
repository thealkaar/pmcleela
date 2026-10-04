require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { Server } = require('socket.io');

const Matchmaker = require('./matchmaker');
const db = require('./db');
const { sendOtpEmail } = require('./emailService');
const { trimAndCropVideo } = require('./videoProcessor');

const app = express();
const server = http.createServer(app);

app.set('trust proxy', 1);

// Video files are handled as multipart uploads below, not buffered by JSON parsing.
app.use(cors());
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || '500mb';
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

const configuredUploadLimitMb = Number(process.env.MAX_UPLOAD_MB || 2048);
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
    fieldSize: 100 * 1024 * 1024      // 100MB field text max
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
  
  socket.emit('online_stats', matchmaker.getOnlineStats());

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
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    appName: 'पी एम सी Leela',
    college: 'MANIT Bhopal',
    serverTime: new Date().toISOString(),
    stats: matchmaker.getOnlineStats()
  });
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
    const existing = db.findUserByEmail(validation.email);
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
app.post('/api/auth/verify-and-register', (req, res) => {
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
    const newUser = db.registerVerifiedUser({
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
      user: newUser,
      token: `tok_${Date.now()}_${newUser.id}`
    });
  } catch (err) {
    console.error('Verify & Register error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// 3. LEGACY / DIRECT REGISTER (Fallback with automatic validation)
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, fullName, phone, gender, academicYear, hostel, anonymousName, avatarUrl } = req.body;
    if (!email || !password || !gender || !anonymousName) {
      return res.status(400).json({
        success: false,
        message: 'Email, password, gender, and anonymous name are required.'
      });
    }

    const newUser = db.registerUser({
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
      user: newUser,
      token: `tok_${Date.now()}_${newUser.id}`
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 4. LOGIN STUDENT ACCOUNT (Using Email OR Scholar No OR Anonymous Name + Password)
app.post('/api/auth/login', (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide your Email/Scholar No/Anonymous Name and Password.'
      });
    }

    const user = db.loginUser(identifier, password);
    res.json({
      success: true,
      message: 'Logged in successfully!',
      user,
      token: `tok_${Date.now()}_${user.id}`
    });
  } catch (err) {
    res.status(401).json({ success: false, message: err.message });
  }
});

// 5. UPDATE ANONYMOUS PERSONA
app.post('/api/auth/update-persona', (req, res) => {
  try {
    const { userId, newAnonymousName } = req.body;
    if (!userId || !newAnonymousName) {
      return res.status(400).json({ success: false, message: 'User ID and new anonymous name required.' });
    }
    const updatedUser = db.updateUserPersona(userId, newAnonymousName);
    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, user: updatedUser });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. DELETE USER ACCOUNT & ALL ASSOCIATED DATA
app.delete('/api/auth/delete-account', (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID is required.' });
    }

    const result = db.deleteUser(userId);
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

    console.log(`[Account] Deleted user ${result.deletedUser.anonymousName} (${result.deletedUser.email}), removed ${result.deletedReelFiles.length} reel files`);

    res.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted.',
      deletedReels: result.deletedReelFiles.length
    });
  } catch (err) {
    console.error('Delete account error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. GET LEELA REELS FEED
app.get('/api/reels', (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol;
  const rawReels = db.getReels();
  const reels = rawReels.map(r => {
    let url = r.videoUrl;
    if (url && url.includes('/uploads/')) {
      const filename = url.split('/uploads/').pop();
      url = `${protocol}://${host}/uploads/${filename}`;
    }
    return {
      ...r,
      videoUrl: url
    };
  });
  res.json({ success: true, count: reels.length, data: reels });
});

// 8. UPLOAD REEL TO PC LOCAL STORAGE
app.post('/api/reels/upload', (req, res) => {
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
    try {
      const { creatorName, creatorYear, caption, audioTitle, tags, creatorId, trimStart, trimEnd, cropMode } = req.body;
      let videoUrl = req.body.videoUrl;

      if (!uploadedPath && req.body && req.body.videoBase64) {
        const base64Data = req.body.videoBase64;
        const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        let buffer;
        if (matches && matches.length === 3) {
          buffer = Buffer.from(matches[2], 'base64');
        } else {
          buffer = Buffer.from(base64Data, 'base64');
        }
        const filename = `leela_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`;
        uploadedPath = path.join(uploadsDir, filename);
        fs.writeFileSync(uploadedPath, buffer);
      }

      const hasTrimStart = trimStart !== undefined && trimStart !== '';
      const hasTrimEnd = trimEnd !== undefined && trimEnd !== '';
      if (hasTrimStart !== hasTrimEnd) {
        const error = new Error('Both trimStart and trimEnd are required to process a trimmed reel.');
        error.statusCode = 400;
        throw error;
      }
      if (hasTrimStart && !uploadedPath) {
        const error = new Error('A video file is required to process the selected trim range.');
        error.statusCode = 400;
        throw error;
      }

      if (uploadedPath && hasTrimStart && hasTrimEnd) {
        const processedVideo = await trimAndCropVideo(uploadedPath, {
          trimStart,
          trimEnd,
          cropMode: cropMode || '9:16'
        });
        await fs.promises.unlink(uploadedPath).catch((cleanupError) => {
          if (cleanupError.code !== 'ENOENT') {
            console.error('Could not remove original reel upload:', cleanupError);
          }
        });
        uploadedPath = processedVideo.path;
      }

      if (uploadedPath) {
        const host = req.get('host');
        const protocol = req.protocol;
        videoUrl = `${protocol}://${host}/uploads/${path.basename(uploadedPath)}`;
      }

      if (!videoUrl) {
        return res.status(400).json({ success: false, message: 'Video file is required.' });
      }

      const newReel = db.addReel({
        creatorId,
        creatorName: creatorName || 'Campus Creator',
        creatorYear: creatorYear || 'Student',
        caption: caption || 'Campus vibes on Leela',
        videoUrl,
        audioTitle: audioTitle || 'Original Audio',
        tags: typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : (tags || ['#PMC', '#MANIT', '#Leela']),
        trimStart: trimStart || 0,
        trimEnd: trimEnd || 0,
        cropMode: cropMode || '9:16'
      });

      console.log(`[Leela] New reel permanently stored on PC: ${newReel.id} by ${creatorName} (${creatorYear}), URL: ${videoUrl}`);
      res.status(201).json({ success: true, data: newReel });
    } catch (saveErr) {
      console.error('Reel upload error:', saveErr);
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
app.post('/api/reels/:id/like', (req, res) => {
  const updatedReel = db.toggleLike(req.params.id);
  if (!updatedReel) {
    return res.status(404).json({ success: false, message: 'Reel not found.' });
  }
  res.json({ success: true, data: updatedReel });
});

// 9. POST COMMENT ON REEL
app.post('/api/reels/:id/comments', (req, res) => {
  const { user, text, userYear } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, message: 'Comment text is required.' });
  }
  const comment = db.addComment(req.params.id, user, text, userYear);
  if (!comment) {
    return res.status(404).json({ success: false, message: 'Reel not found.' });
  }
  res.json({ success: true, data: comment });
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
server.listen(PORT, '0.0.0.0', () => {
  console.log(`===================================================`);
  console.log(`🚀 पी एम सी Leela Server Active on port ${PORT}`);
  console.log(`💾 Local JSON database and uploads are available in server/data and server/uploads`);
  console.log(`🛡️ MANIT Email OTP Verification: Active (domain: @stu.manit.ac.in)`);
  console.log(`❤️ Piya Milan Chauraha: Socket.io Matchmaker Active`);
  console.log(`🎬 Leela Reels: Local Storage & Streaming API Active`);
  console.log(`===================================================`);
});
