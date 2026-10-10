const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const REELS_FILE = path.join(DATA_DIR, 'reels.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reel-reports.json');
const CHAT_REPORTS_FILE = path.join(DATA_DIR, 'chat-reports.json');
const STUDENT_IDENTITIES_FILE = path.join(DATA_DIR, 'student-identities.json');
const ACCOUNT_DELETION_REQUESTS_FILE = path.join(DATA_DIR, 'account-deletion-requests.json');
const CHAT_REPORT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const CHAT_REPORT_COOLDOWN_MESSAGE = 'You can submit only one PMC chat report every 24 hours.';
const PUSH_TOKENS_FILE = path.join(DATA_DIR, 'push-tokens.json');
const ANNOUNCEMENTS_FILE = path.join(DATA_DIR, 'announcements.json');
const APP_RELEASES_FILE = path.join(DATA_DIR, 'app-releases.json');

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
    return true;
  } catch (err) {
    console.error(`Error writing ${file}:`, err);
    return false;
  }
}

class LocalDB {
  constructor({ useLocalFiles = true } = {}) {
    if (useLocalFiles && !fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    this.users = useLocalFiles ? readJson(USERS_FILE, []) : [];
    this.reels = useLocalFiles ? readJson(REELS_FILE, []) : [];
    this.reports = useLocalFiles ? readJson(REPORTS_FILE, []) : [];
    this.chatReports = useLocalFiles ? readJson(CHAT_REPORTS_FILE, []) : [];
    this.studentIdentities = useLocalFiles ? readJson(STUDENT_IDENTITIES_FILE, []) : [];
    this.accountDeletionRequests = useLocalFiles ? readJson(ACCOUNT_DELETION_REQUESTS_FILE, []) : [];
    this.pushTokens = useLocalFiles ? readJson(PUSH_TOKENS_FILE, []) : [];
    this.announcements = useLocalFiles ? readJson(ANNOUNCEMENTS_FILE, []) : [];
    this.appReleases = useLocalFiles ? readJson(APP_RELEASES_FILE, []) : [];
    let usersChanged = false;
    this.users.forEach(user => {
      if (!user.leelaUsername) {
        user.leelaUsername = `Leela_${String(user.id).slice(-8)}`;
        usersChanged = true;
      }
    });
    if (usersChanged) writeJson(USERS_FILE, this.users);
    let identitiesChanged = false;
    this.users.forEach(user => {
      const email = user.email?.trim().toLowerCase();
      if (!email || this.studentIdentities.some(identity => identity.email === email)) return;
      this.studentIdentities.push({ email, gender: user.gender || 'male', createdAt: user.createdAt || new Date().toISOString() });
      identitiesChanged = true;
    });
    if (identitiesChanged) writeJson(STUDENT_IDENTITIES_FILE, this.studentIdentities);
    let reelsChanged = false;
    const usersById = new Map(this.users.map(user => [user.id, user]));
    const usersByChatName = new Map(
      this.users.map(user => [user.anonymousName?.trim().toLowerCase(), user])
    );
    this.reels.forEach(reel => {
      const creator = usersById.get(reel.creatorId);
      if (creator && reel.creatorName !== creator.leelaUsername) {
        reel.creatorName = creator.leelaUsername;
        reelsChanged = true;
      }
      (reel.comments || []).forEach(comment => {
        const commenter = usersByChatName.get(comment.user?.trim().toLowerCase());
        if (commenter?.leelaUsername && comment.user !== commenter.leelaUsername) {
          comment.user = commenter.leelaUsername;
          reelsChanged = true;
        }
      });
    });
    if (reelsChanged) writeJson(REELS_FILE, this.reels);
    // In-memory OTP storage: email -> { otp, expiresAt }
    this.otpStore = new Map();
    this.passwordResetOtpStore = new Map();
    this.passwordResetRequestStore = new Map();
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

  findUserByAnonymousName(anonymousName) {
    if (!anonymousName) return null;
    this.refreshUsers();
    const normalizedName = anonymousName.trim().toLowerCase();
    return this.users.find(u => u.anonymousName?.trim().toLowerCase() === normalizedName);
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

  getUsers() {
    return this.refreshUsers();
  }

  /**
   * Save OTP for a student email with 10 minute expiry
   */
  saveOtp(email, otp) {
    const cleanEmail = email.trim().toLowerCase();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    this.otpStore.set(cleanEmail, {
      otp: otp.toString().trim(),
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
    // OTP verified successfully
    return { success: true };
  }

  clearOtp(email) {
    const cleanEmail = email.trim().toLowerCase();
    this.otpStore.delete(cleanEmail);
  }

  savePasswordResetOtp(email, otp) {
    const cleanEmail = email.trim().toLowerCase();
    const now = Date.now();
    const lastRequestedAt = this.passwordResetRequestStore.get(cleanEmail);
    if (lastRequestedAt && now - lastRequestedAt < 60 * 1000) return false;
    this.passwordResetRequestStore.set(cleanEmail, now);
    this.passwordResetOtpStore.set(cleanEmail, {
      otp: String(otp),
      expiresAt: now + 10 * 60 * 1000,
      attempts: 0
    });
    return true;
  }

  verifyPasswordResetOtp(email, otp) {
    const cleanEmail = email.trim().toLowerCase();
    const record = this.passwordResetOtpStore.get(cleanEmail);
    if (!record) {
      return { success: false, message: 'The reset code is invalid or expired. Request a new code and try again.' };
    }
    if (Date.now() > record.expiresAt) {
      this.passwordResetOtpStore.delete(cleanEmail);
      return { success: false, message: 'The reset code is invalid or expired. Request a new code and try again.' };
    }
    if (record.attempts >= 5) {
      this.passwordResetOtpStore.delete(cleanEmail);
      return { success: false, message: 'Too many incorrect attempts. Request a new reset code.' };
    }
    if (record.otp !== String(otp).trim()) {
      record.attempts += 1;
      if (record.attempts >= 5) this.passwordResetOtpStore.delete(cleanEmail);
      return { success: false, message: 'The reset code is invalid or expired. Request a new code and try again.' };
    }
    this.passwordResetOtpStore.delete(cleanEmail);
    return { success: true };
  }

  clearPasswordResetOtp(email) {
    const cleanEmail = email.trim().toLowerCase();
    this.passwordResetOtpStore.delete(cleanEmail);
    this.passwordResetRequestStore.delete(cleanEmail);
  }

  updatePasswordByEmail(email, password) {
    const user = this.findUserByEmail(email);
    if (!user) return null;
    const previousPassword = user.password;
    const previousPasswordHash = user.passwordHash;
    user.password = password;
    delete user.passwordHash;
    if (!writeJson(USERS_FILE, this.users)) {
      if (previousPassword === undefined) delete user.password;
      else user.password = previousPassword;
      if (previousPasswordHash !== undefined) user.passwordHash = previousPasswordHash;
      throw new Error('Could not save the new password. Please try again.');
    }
    return user;
  }

  registerVerifiedUser({ email, password, gender, hostel, anonymousName, academicYear }) {
    const validation = this.validateManitEmail(email);
    if (!validation.valid) {
      throw new Error(validation.message);
    }

    if (this.findUserByEmail(validation.email)) {
      throw new Error('This college email is already registered. Please login.');
    }
    if (gender !== 'male' && gender !== 'female') {
      throw new Error('Choose a valid student gender.');
    }
    const identity = this.studentIdentities.find(item => item.email === validation.email);
    if (identity && identity.gender !== gender) {
      throw new Error(`This MANIT email is registered as ${identity.gender === 'female' ? 'a girl' : 'a boy'}. Re-registration must use the same gender.`);
    }
    const cleanAnonymousName = typeof anonymousName === 'string' ? anonymousName.trim() : '';
    if (!cleanAnonymousName) {
      throw new Error('An anonymous persona name is required.');
    }
    if (this.findUserByAnonymousName(cleanAnonymousName)) {
      throw new Error('This anonymous persona name is already taken. Please choose another.');
    }

    const calculatedYear = academicYear || this.getAcademicYearFromScholarNo(validation.scholarNo);

    const userId = `usr_${uuidv4().slice(0, 8)}`;
    let registeredIdentity = null;
    if (!identity) {
      registeredIdentity = {
        email: validation.email,
        gender,
        createdAt: new Date().toISOString()
      };
      this.studentIdentities.push(registeredIdentity);
      if (!writeJson(STUDENT_IDENTITIES_FILE, this.studentIdentities)) {
        this.studentIdentities.pop();
        throw new Error('Could not save your verified student identity. Please try again.');
      }
    }
    const newUser = {
      id: userId,
      email: validation.email,
      scholarNo: validation.scholarNo,
      password: (password || '').trim(),
      gender: gender || 'male',
      academicYear: calculatedYear,
      hostel: hostel || 'Campus Hostel',
      anonymousName: cleanAnonymousName,
      leelaUsername: `Leela_${userId.slice(-8)}`,
      isEmailVerified: true,
      createdAt: new Date().toISOString()
    };

    this.users.unshift(newUser);
    if (!writeJson(USERS_FILE, this.users)) {
      this.users.shift();
      if (registeredIdentity) {
        this.studentIdentities = this.studentIdentities.filter(item => item !== registeredIdentity);
        if (!writeJson(STUDENT_IDENTITIES_FILE, this.studentIdentities)) {
          console.error(`[LocalDB] Could not roll back the unregistered identity ${validation.email}.`);
        }
      }
      throw new Error('Could not save your student account. Please try again.');
    }
    this.clearOtp(validation.email);
    return newUser;
  }

  requestAccountDeletion(userId) {
    const user = this.findUserById(userId);
    if (!user) return null;
    const pending = this.accountDeletionRequests.find(
      request => request.userId === userId && request.status === 'pending'
    );
    if (pending) return pending;

    const requestedAt = new Date();
    const request = {
      id: `deletion_${uuidv4()}`,
      userId,
      email: user.email,
      displayName: user.anonymousName || 'Student',
      gender: user.gender || 'male',
      status: 'pending',
      requestedAt: requestedAt.toISOString(),
      deleteAfter: new Date(requestedAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null
    };
    this.accountDeletionRequests.unshift(request);
    if (!writeJson(ACCOUNT_DELETION_REQUESTS_FILE, this.accountDeletionRequests)) {
      this.accountDeletionRequests.shift();
      throw new Error('Could not submit your account deletion request. Please try again.');
    }
    return request;
  }

  getAccountDeletionRequestForUser(userId) {
    return this.accountDeletionRequests.find(
      request => request.userId === userId && request.status === 'pending'
    ) || null;
  }

  getAccountDeletionRequests({ status = 'pending' } = {}) {
    return this.accountDeletionRequests
      .filter(request => !status || request.status === status)
      .sort((left, right) => new Date(left.requestedAt) - new Date(right.requestedAt));
  }

  getDueAccountDeletionRequests(now = new Date()) {
    return this.accountDeletionRequests.filter(
      request => request.status === 'pending' && Date.parse(request.deleteAfter) <= now.getTime()
    );
  }

  rejectAccountDeletionRequest(requestId) {
    const request = this.accountDeletionRequests.find(
      item => item.id === requestId && item.status === 'pending'
    );
    if (!request) return null;
    request.status = 'rejected';
    request.resolvedAt = new Date().toISOString();
    if (!writeJson(ACCOUNT_DELETION_REQUESTS_FILE, this.accountDeletionRequests)) {
      request.status = 'pending';
      request.resolvedAt = null;
      throw new Error('Could not update the account deletion request. Please try again.');
    }
    return request;
  }

  completeAccountDeletionRequest(requestId, status = 'approved') {
    const request = this.accountDeletionRequests.find(
      item => item.id === requestId && item.status === 'pending'
    );
    if (!request) return null;
    const deletion = this.deleteUser(request.userId);
    if (!deletion) return null;
    request.status = status;
    request.resolvedAt = new Date().toISOString();
    if (!writeJson(ACCOUNT_DELETION_REQUESTS_FILE, this.accountDeletionRequests)) {
      console.error(`[LocalDB] Could not mark account deletion request ${requestId} as ${status}.`);
    }
    return { ...deletion, request };
  }

  registerUser(userData) {
    return this.registerVerifiedUser(userData);
  }

  loginUser(identifier, password) {
    const user = this.findUserByIdentifier(identifier);
    if (!user) {
      throw new Error('Account not found. Please check your scholar number or register.');
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

  updateUsernames(userId, { anonymousName, leelaUsername }) {
    this.refreshUsers();
    const user = this.users.find(u => u.id === userId);
    if (!user) return null;
    const chatName = typeof anonymousName === 'string' ? anonymousName.trim() : user.anonymousName;
    const reelName = typeof leelaUsername === 'string' ? leelaUsername.trim() : user.leelaUsername;
    if (!chatName || !reelName) {
      throw new Error('Both PMC chat and Leela usernames are required.');
    }
    if (chatName.length > 30 || reelName.length > 30) {
      throw new Error('Usernames cannot exceed 30 characters.');
    }
    if (chatName.toLowerCase() === reelName.toLowerCase()) {
      throw new Error('Your Leela username must be different from your PMC chat username.');
    }
    if (this.users.some(existing => existing.id !== userId &&
      existing.anonymousName?.trim().toLowerCase() === chatName.toLowerCase())) {
      throw new Error('This PMC chat username is already taken. Please choose another.');
    }
    if (this.users.some(existing => existing.id !== userId &&
      existing.leelaUsername?.trim().toLowerCase() === reelName.toLowerCase())) {
      throw new Error('This Leela username is already taken. Please choose another.');
    }

    const oldChatName = user.anonymousName;
    const oldLeelaName = user.leelaUsername;
    user.anonymousName = chatName;
    user.leelaUsername = reelName;
    if (!writeJson(USERS_FILE, this.users)) {
      user.anonymousName = oldChatName;
      user.leelaUsername = oldLeelaName;
      throw new Error('Could not save your usernames. Please try again.');
    }
    return user;
  }

  reportPmcChatUser(reporterId, reportedUserId, reason) {
    const reporter = this.findUserById(reporterId);
    const reportedUser = this.findUserById(reportedUserId);
    if (!reporter || !reportedUser) return null;
    if (reporter.gender !== 'female') {
      throw new Error('Only female students can report accounts from PMC chat.');
    }
    if (reporterId === reportedUserId) {
      throw new Error('You cannot report your own account.');
    }

    const now = Date.now();
    const recentReportCutoff = now - CHAT_REPORT_COOLDOWN_MS;
    const recentReport = this.chatReports.some(report =>
      report.reporterId === reporterId &&
      Date.parse(report.createdAt || '') >= recentReportCutoff
    );
    if (recentReport) throw new Error(CHAT_REPORT_COOLDOWN_MESSAGE);

    const existingBlock = Date.parse(reportedUser.pmcChatBlockedUntil || '');
    const blockedUntil = new Date(Math.max(now + 2 * 24 * 60 * 60 * 1000, Number.isFinite(existingBlock) ? existingBlock : 0));
    const previousBlock = reportedUser.pmcChatBlockedUntil;
    reportedUser.pmcChatBlockedUntil = blockedUntil.toISOString();
    const report = {
      id: `chat_report_${uuidv4()}`,
      reporterId,
      reportedUserId,
      reason,
      blockedUntil: blockedUntil.toISOString(),
      createdAt: new Date(now).toISOString()
    };
    this.chatReports.unshift(report);
    if (!writeJson(USERS_FILE, this.users)) {
      if (previousBlock === undefined) delete reportedUser.pmcChatBlockedUntil;
      else reportedUser.pmcChatBlockedUntil = previousBlock;
      this.chatReports.shift();
      throw new Error('Could not save this report. Please try again.');
    }
    if (!writeJson(CHAT_REPORTS_FILE, this.chatReports)) {
      if (previousBlock === undefined) delete reportedUser.pmcChatBlockedUntil;
      else reportedUser.pmcChatBlockedUntil = previousBlock;
      this.chatReports.shift();
      if (!writeJson(USERS_FILE, this.users)) {
        console.error('[LocalDB] Could not roll back a failed PMC chat report.');
      }
      throw new Error('Could not save this report. Please try again.');
    }
    return { blockedUntil: blockedUntil.toISOString() };
  }

  updateUserAvatar(userId, avatarStorageKey) {
    const user = this.findUserById(userId);
    if (!user) return null;
    user.avatarStorageKey = avatarStorageKey;
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
    this.reports = this.reports.filter(report => report.reporterId !== userId);
    writeJson(REPORTS_FILE, this.reports);
    this.chatReports = this.chatReports.filter(
      report => report.reporterId !== userId && report.reportedUserId !== userId
    );
    writeJson(CHAT_REPORTS_FILE, this.chatReports);
    this.pushTokens = this.pushTokens.filter(item => item.userId !== userId);
    writeJson(PUSH_TOKENS_FILE, this.pushTokens);

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
      const creator = this.users.find(user => user.id === reel.creatorId);
      if (creator?.leelaUsername) reel.creatorName = creator.leelaUsername;
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
      createdAt: new Date().toISOString()
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

  getReel(reelId) {
    return this.reels.find(reel => reel.id === reelId) || null;
  }

  deleteReel(reelId) {
    const index = this.reels.findIndex(reel => reel.id === reelId);
    if (index < 0) return null;
    const [deletedReel] = this.reels.splice(index, 1);
    writeJson(REELS_FILE, this.reels);
    this.reports = this.reports.filter(report => report.reelId !== reelId);
    writeJson(REPORTS_FILE, this.reports);
    this.announcements = this.announcements.filter(item => item.id !== `reel_${reelId}`);
    writeJson(ANNOUNCEMENTS_FILE, this.announcements);
    const deletedReelFiles = [];
    if (deletedReel.videoUrl && deletedReel.videoUrl.includes('/uploads/')) {
      const filename = deletedReel.videoUrl.split('/uploads/').pop();
      if (filename) deletedReelFiles.push(filename);
    }
    return {
      deletedReel,
      deletedReelFiles,
      deletedReelStorageKeys: deletedReel.videoStorageKey ? [deletedReel.videoStorageKey] : []
    };
  }

  getReelReports({ status } = {}) {
    return this.reports
      .filter(report => !status || report.status === status)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(report => ({
        ...report,
        reel: this.getReel(report.reelId),
        reporter: this.findUserById(report.reporterId)
      }));
  }

  addReelReport(reelId, reporterId, reason) {
    if (!this.getReel(reelId) || !this.findUserById(reporterId)) return null;
    if (this.reports.some(report => report.reelId === reelId && report.reporterId === reporterId)) {
      return { duplicate: true };
    }
    const report = {
      id: `report_${uuidv4()}`,
      reelId,
      reporterId,
      reason,
      status: 'pending',
      createdAt: new Date().toISOString(),
      reviewedAt: null
    };
    this.reports.unshift(report);
    writeJson(REPORTS_FILE, this.reports);
    return report;
  }

  updateReelReportStatus(reportId, status) {
    const report = this.reports.find(item => item.id === reportId);
    if (!report) return null;
    report.status = status;
    report.reviewedAt = new Date().toISOString();
    writeJson(REPORTS_FILE, this.reports);
    return report;
  }

  registerPushToken(userId, token, platform) {
    if (!this.findUserById(userId)) return null;
    this.pushTokens = this.pushTokens.filter(item => item.token !== token);
    const registration = { token, userId, platform, updatedAt: new Date().toISOString() };
    this.pushTokens.push(registration);
    writeJson(PUSH_TOKENS_FILE, this.pushTokens);
    return registration;
  }

  getPushTokens() {
    return this.pushTokens;
  }

  removePushTokens(tokens) {
    const removed = new Set(tokens);
    this.pushTokens = this.pushTokens.filter(item => !removed.has(item.token));
    writeJson(PUSH_TOKENS_FILE, this.pushTokens);
  }

  removePushTokenForUser(userId, token) {
    const countBefore = this.pushTokens.length;
    this.pushTokens = this.pushTokens.filter(item => item.userId !== userId || item.token !== token);
    if (this.pushTokens.length !== countBefore) writeJson(PUSH_TOKENS_FILE, this.pushTokens);
  }

  addAnnouncement({ id, title, message }) {
    const announcement = { id, title, message, createdAt: new Date().toISOString() };
    this.announcements.unshift(announcement);
    writeJson(ANNOUNCEMENTS_FILE, this.announcements);
    return announcement;
  }

  getAnnouncements(limit = null) {
    return limit == null ? this.announcements : this.announcements.slice(0, limit);
  }

  deleteAnnouncement(id) {
    const index = this.announcements.findIndex(item => item.id === id);
    if (index < 0) return false;
    const [announcement] = this.announcements.splice(index, 1);
    if (!writeJson(ANNOUNCEMENTS_FILE, this.announcements)) {
      this.announcements.splice(index, 0, announcement);
      throw new Error('Could not persist the deleted broadcast.');
    }
    return true;
  }

  addAppRelease(release) {
    if (this.appReleases.some(item => item.versionCode === release.versionCode)) {
      const error = new Error('This Android version code has already been published.');
      error.code = 'DUPLICATE_VERSION_CODE';
      throw error;
    }
    const saved = { ...release, createdAt: new Date().toISOString() };
    this.appReleases.push(saved);
    this.appReleases.sort((a, b) => b.versionCode - a.versionCode);
    writeJson(APP_RELEASES_FILE, this.appReleases);
    return saved;
  }

  getAppRelease() {
    return this.appReleases[0] || null;
  }

  getAppReleases(limit = 10) {
    return this.appReleases.slice(0, limit);
  }
}

module.exports = { LocalDB };
