const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REELS_FILE = path.join(DATA_DIR, 'reels.json');

function readJson(file, defaultValue = []) {
  try {
    if (fs.existsSync(file)) {
      const data = fs.readFileSync(file, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Error reading ${file}:`, err);
  }
  return defaultValue;
}

function writeJson(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
  }
}

class LocalDB {
  constructor({ useLocalFiles = true } = {}) {
    if (useLocalFiles && !fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.users = useLocalFiles ? readJson(USERS_FILE, []) : [];
    this.reels = useLocalFiles ? readJson(REELS_FILE, []) : [];
    // In-memory OTP storage: email -> { otp, studentData, expiresAt }
    this.otpStore = new Map();
  }

  /**
   * Validate MANIT student email format: scholarNO@stu.manit.ac.in
   * Also returns scholarNO
   */
  validateManitEmail(email) {
    if (!email || typeof email !== 'string') {
      return { valid: false, message: 'Email is required' };
    }
    const cleanEmail = email.trim().toLowerCase();
    const regex = /^([a-z0-9._%+-]+)@stu\.manit\.ac\.in$/i;
    const match = cleanEmail.match(regex);
    if (!match) {
      return {
        valid: false,
        message: 'Only MANIT student emails are allowed (e.g. scholarNO@stu.manit.ac.in).'
      };
    }
    const scholarNo = match[1];
    return {
      valid: true,
      email: cleanEmail,
      scholarNo: scholarNo.toUpperCase()
    };
  }

  /**
   * Derive Academic Year (1st, 2nd, 3rd, 4th) from MANIT Scholar Number
   * Based on current reference year 2026.
   * e.g., 26xxxxxxx -> 1st, 25xxxxxxx -> 2nd, 24xxxxxxx -> 3rd, 23xxxxxxx -> 4th
   */
  getAcademicYearFromScholarNo(scholarNo) {
    if (!scholarNo || typeof scholarNo !== 'string') return '1st';
    const match = scholarNo.trim().match(/^(\d{2})/);
    if (!match) return '1st';
    const prefix = parseInt(match[1], 10);
    const diff = 26 - prefix; // Current 2026 academic year
    if (diff <= 0) return '1st';
    if (diff === 1) return '2nd';
    if (diff === 2) return '3rd';
    if (diff >= 3) return '4th';
    return '1st';
  }

  async initialize() {}

  async checkConnection() {
    return true;
  }

  async close() {}

  // --- USER AUTH METHODS ---
  refreshUsers() {
    this.users = readJson(USERS_FILE, []);
    let modified = false;
    for (const u of this.users) {
      if (!u.academicYear) {
        u.academicYear = this.getAcademicYearFromScholarNo(u.scholarNo || u.email);
        modified = true;
      }
    }
    if (modified) {
      writeJson(USERS_FILE, this.users);
    }
    return this.users;
  }

  findUserByEmail(email) {
    if (!email) return null;
    this.refreshUsers();
    return this.users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  }

  findUserByPhone(phone) {
    if (!phone) return null;
    this.refreshUsers();
    const cleanPhone = phone.trim().replace(/\D/g, '');
    return this.users.find(u => (u.phone || '').replace(/\D/g, '') === cleanPhone);
  }

  findUserByAnonymousName(anonymousName) {
    if (!anonymousName) return null;
    this.refreshUsers();
    return this.users.find(u => u.anonymousName.toLowerCase() === anonymousName.trim().toLowerCase());
  }

  findUserByIdentifier(identifier) {
    if (!identifier) return null;
    this.refreshUsers();
    const term = identifier.trim().toLowerCase();
    return this.users.find(u => 
      u.email.toLowerCase() === term || 
      u.anonymousName.toLowerCase() === term ||
      (u.scholarNo && u.scholarNo.toLowerCase() === term)
    );
  }

  findUserById(id) {
    if (!id) return null;
    this.refreshUsers();
    return this.users.find(user => user.id === id);
  }

  /**
   * Save OTP for a student email with 10 minute expiry
   */
  saveOtp(email, otp, studentData = {}) {
    const cleanEmail = email.trim().toLowerCase();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    this.otpStore.set(cleanEmail, {
      otp: otp.toString().trim(),
      studentData,
      expiresAt
    });
  }

  /**
   * Verify provided OTP
   */
  verifyOtp(email, otp) {
    const cleanEmail = email.trim().toLowerCase();
    const record = this.otpStore.get(cleanEmail);
    if (!record) {
      return { success: false, message: 'No OTP requested for this email or OTP expired. Please request a new OTP.' };
    }
    if (Date.now() > record.expiresAt) {
      this.otpStore.delete(cleanEmail);
      return { success: false, message: 'OTP has expired. Please request a new one.' };
    }
    if (record.otp !== otp.toString().trim()) {
      return { success: false, message: 'Invalid OTP code. Please enter the 6-digit code received in email.' };
    }
    const studentData = record.studentData;
    // OTP verified successfully
    return { success: true, studentData };
  }

  clearOtp(email) {
    const cleanEmail = email.trim().toLowerCase();
    this.otpStore.delete(cleanEmail);
  }

  registerVerifiedUser({ fullName, phone, email, password, gender, hostel, anonymousName, avatarUrl, academicYear }) {
    const validation = this.validateManitEmail(email);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    if (this.findUserByEmail(validation.email)) {
      throw new Error('This college email is already registered. Please login.');
    }
    if (this.findUserByAnonymousName(anonymousName)) {
      throw new Error('This anonymous persona name is already taken. Please choose another.');
    }

    const calculatedYear = academicYear || this.getAcademicYearFromScholarNo(validation.scholarNo);

    const newUser = {
      id: `usr_${uuidv4().slice(0, 8)}`,
      email: validation.email,
      scholarNo: validation.scholarNo,
      fullName: (fullName || 'MANIT Student').trim(),
      phone: (phone || '').trim(),
      password: (password || '').trim(),
      gender: gender || 'male',
      academicYear: calculatedYear,
      hostel: hostel || 'Campus Hostel',
      anonymousName: (anonymousName || '').trim(),
      avatarUrl: avatarUrl || null,
      isEmailVerified: true,
      createdAt: new Date().toISOString()
    };

    this.users.unshift(newUser);
    writeJson(USERS_FILE, this.users);
    this.clearOtp(validation.email);
    return newUser;
  }

  registerUser(userData) {
    return this.registerVerifiedUser(userData);
  }

  loginUser(identifier, password) {
    const user = this.findUserByIdentifier(identifier);
    if (!user) {
      throw new Error('Account not found. Please check your Email / Scholar No / Anonymous Name or Register.');
    }
    if (user.password !== password.trim()) {
      throw new Error('Incorrect password. Please try again.');
    }
    // Ensure academicYear exists
    if (!user.academicYear) {
      user.academicYear = this.getAcademicYearFromScholarNo(user.scholarNo);
    }
    return user;
  }

  updateUserPersona(userId, newAnonymousName) {
    const user = this.users.find(u => u.id === userId);
    if (!user) return null;
    user.anonymousName = newAnonymousName.trim();
    writeJson(USERS_FILE, this.users);
    return user;
  }

  /**
   * Delete a user account and all their associated reels.
   * Returns the deleted user and associated local files/storage keys for cleanup.
   */
  deleteUser(userId) {
    this.refreshUsers();
    const userIndex = this.users.findIndex(u => u.id === userId);
    if (userIndex === -1) return null;

    const deletedUser = this.users[userIndex];

    // Remove user from users list
    this.users.splice(userIndex, 1);
    writeJson(USERS_FILE, this.users);

    // Find and remove all reels created by this user
    const deletedReelFiles = [];
    const deletedReelStorageKeys = [];
    const remainingReels = [];
    for (const reel of this.reels) {
      if (reel.creatorId === userId) {
        if (reel.videoStorageKey) {
          deletedReelStorageKeys.push(reel.videoStorageKey);
        }
        // Extract local filename from videoUrl if it's a local upload
        if (reel.videoUrl && reel.videoUrl.includes('/uploads/')) {
          const filename = reel.videoUrl.split('/uploads/').pop();
          if (filename) deletedReelFiles.push(filename);
        }
      } else {
        remainingReels.push(reel);
      }
    }
    this.reels = remainingReels;
    writeJson(REELS_FILE, this.reels);

    return { deletedUser, deletedReelFiles, deletedReelStorageKeys };
  }

  // --- REELS METHODS ---
  getReels(userId) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfDayBefore = startOfYesterday - 24 * 60 * 60 * 1000;

    const todayReels = [];
    const yesterdayReels = [];
    const dayBeforeReels = [];
    const olderReels = [];

    this.reels.forEach(reel => {
      const likedBy = Array.isArray(reel.likedBy) ? reel.likedBy : [];
      reel.likesCount = likedBy.length;
      reel.isLiked = Boolean(userId && likedBy.includes(userId));
      const reelTime = new Date(reel.createdAt || Date.now()).getTime();
      if (reelTime >= startOfToday) {
        todayReels.push(reel);
      } else if (reelTime >= startOfYesterday) {
        yesterdayReels.push(reel);
      } else if (reelTime >= startOfDayBefore) {
        dayBeforeReels.push(reel);
      } else {
        olderReels.push(reel);
      }
    });

    const sortBucket = (arr) => {
      return [...arr].sort((a, b) => {
        const timeA = new Date(a.createdAt || 0).getTime();
        const timeB = new Date(b.createdAt || 0).getTime();
        return timeB - timeA;
      });
    };

    return [
      ...sortBucket(todayReels),
      ...sortBucket(yesterdayReels),
      ...sortBucket(dayBeforeReels),
      ...sortBucket(olderReels)
    ].map(({ likedBy, ...reel }) => reel);
  }

  addReel({ creatorId, creatorName, creatorYear, caption, videoUrl, videoStorageKey, audioTitle, tags, trimStart, trimEnd, cropMode }) {
    const newReel = {
      id: `reel_${Date.now()}_${uuidv4().slice(0, 6)}`,
      creatorId,
      creatorName: creatorName || 'Campus Creator',
      creatorYear: creatorYear || 'Student',
      caption: caption || 'Campus moment on Leela',
      videoUrl,
      videoStorageKey: videoStorageKey || null,
      trimStart: Number(trimStart) || 0,
      trimEnd: Number(trimEnd) || 0,
      cropMode: cropMode || '9:16',
      likesCount: 0,
      commentsCount: 0,
      isLiked: false,
      likedBy: [],
      audioTitle: audioTitle || 'Original Audio',
      tags: tags || ['#PMC', '#MANIT', '#Leela'],
      comments: [],
      createdAt: new Date().toISOString()
    };
    this.reels.unshift(newReel);
    writeJson(REELS_FILE, this.reels);
    const { likedBy, ...publicReel } = newReel;
    return publicReel;
  }

  toggleLike(reelId, userId) {
    const reel = this.reels.find(r => r.id === reelId);
    if (!reel) return null;
    if (!userId) return null;
    reel.likedBy = Array.isArray(reel.likedBy) ? reel.likedBy : [];
    const existingIndex = reel.likedBy.indexOf(userId);
    if (existingIndex >= 0) {
      reel.likedBy.splice(existingIndex, 1);
    } else {
      reel.likedBy.push(userId);
    }
    reel.likesCount = reel.likedBy.length;
    reel.isLiked = existingIndex < 0;
    writeJson(REELS_FILE, this.reels);
    return { isLiked: reel.isLiked, likesCount: reel.likesCount };
  }

  addComment(reelId, user, text, userYear) {
    const reel = this.reels.find(r => r.id === reelId);
    if (!reel) return null;
    const comment = {
      id: `c_${uuidv4()}`,
      user: user || 'Anonymous Student',
      userYear: userYear || 'Student',
      text,
      time: 'Just now'
    };
    if (!reel.comments) reel.comments = [];
    reel.comments.unshift(comment);
    reel.commentsCount = reel.comments.length;
    writeJson(REELS_FILE, this.reels);
    return comment;
  }

  countReelComments(reelId) {
    const reel = this.reels.find(item => item.id === reelId);
    return reel ? (reel.comments || []).length : 0;
  }
}

module.exports = { LocalDB };
