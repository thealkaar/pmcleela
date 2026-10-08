const crypto = require('crypto');
const { promisify } = require('util');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const ACCOUNT_NOT_FOUND = 'Account not found. Please check your Email / Scholar No / Anonymous Name or Register.';
const scrypt = promisify(crypto.scrypt);

function isAnonymousNameUniqueError(error) {
  if (error.code !== 'P2002') return false;
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.some(field => field === 'anonymous_name' || field === 'anonymousName')
    : typeof target === 'string' && (
      /anonymous[_A-Za-z]*name/i.test(target) || target.toLowerCase().includes('anonymous_name')
    );
}

function isLeelaUsernameUniqueError(error) {
  if (error.code !== 'P2002') return false;
  const target = error.meta?.target;
  return Array.isArray(target)
    ? target.some(field => field === 'leela_username' || field === 'leelaUsername')
    : typeof target === 'string' && /leela[_A-Za-z]*username/i.test(target);
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = await scrypt(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = await scrypt(password, salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

class PrismaDB {
  constructor(LocalDB) {
    this.localHelpers = new LocalDB({ useLocalFiles: false });
    this.client = new PrismaClient();
  }

  validateManitEmail(...args) {
    return this.localHelpers.validateManitEmail(...args);
  }

  getAcademicYearFromScholarNo(...args) {
    return this.localHelpers.getAcademicYearFromScholarNo(...args);
  }

  saveOtp(...args) {
    return this.localHelpers.saveOtp(...args);
  }

  verifyOtp(...args) {
    return this.localHelpers.verifyOtp(...args);
  }

  clearOtp(...args) {
    return this.localHelpers.clearOtp(...args);
  }

  savePasswordResetOtp(...args) {
    return this.localHelpers.savePasswordResetOtp(...args);
  }

  verifyPasswordResetOtp(...args) {
    return this.localHelpers.verifyPasswordResetOtp(...args);
  }

  clearPasswordResetOtp(...args) {
    return this.localHelpers.clearPasswordResetOtp(...args);
  }

  async initialize() {
    await this.client.$connect();
    console.log('[Supabase] Connected using Prisma ORM.');
  }

  async checkConnection() {
    await this.client.$queryRaw`SELECT 1`;
    return true;
  }

  async close() {
    await this.client.$disconnect();
  }

  async findUserByEmail(email) {
    if (!email) return null;
    const user = await this.client.pmcUser.findUnique({
      where: { email: email.trim().toLowerCase() }
    });
    return user?.data || null;
  }

  async findUserByAnonymousName(anonymousName) {
    if (!anonymousName) return null;
    const user = await this.client.pmcUser.findUnique({
      where: { anonymousName: anonymousName.trim().toLowerCase() }
    });
    return user?.data || null;
  }

  async findUserByIdentifier(identifier) {
    if (!identifier) return null;
    const term = identifier.trim().toLowerCase();
    const user = await this.client.pmcUser.findFirst({
      where: {
        OR: [
          { email: term },
          { anonymousName: term },
          { scholarNo: term }
        ]
      }
    });
    return user?.data || null;
  }

  async findUserById(id) {
    if (!id) return null;
    const user = await this.client.pmcUser.findUnique({ where: { id } });
    return user?.data || null;
  }

  async getUsers() {
    const users = await this.client.pmcUser.findMany({ orderBy: { email: 'asc' } });
    return users.map(({ data }) => data);
  }

  async registerVerifiedUser({
    email,
    password,
    gender,
    hostel,
    anonymousName,
    academicYear
  }) {
    const validation = this.validateManitEmail(email);
    if (!validation.valid) throw new Error(validation.message);

    const cleanAnonymousName = (anonymousName || '').trim();
    if (!cleanAnonymousName) throw new Error('An anonymous persona name is required.');
    if (typeof password !== 'string' || !password.trim()) throw new Error('A password is required.');
    if (gender !== 'male' && gender !== 'female') throw new Error('Choose a valid student gender.');

    if (await this.findUserByEmail(validation.email)) {
      throw new Error('This college email is already registered. Please login.');
    }
    if (await this.findUserByAnonymousName(cleanAnonymousName)) {
      throw new Error('This anonymous persona name is already taken. Please choose another.');
    }

    const userId = `usr_${uuidv4().slice(0, 8)}`;
    const newUser = {
      id: userId,
      email: validation.email,
      scholarNo: validation.scholarNo,
      gender: gender || 'male',
      academicYear: academicYear || this.getAcademicYearFromScholarNo(validation.scholarNo),
      hostel: hostel || 'Campus Hostel',
      anonymousName: cleanAnonymousName,
      leelaUsername: `Leela_${userId.slice(-8)}`,
      isEmailVerified: true,
      createdAt: new Date().toISOString()
    };
    const passwordHash = await hashPassword(password.trim());

    try {
      await this.client.$transaction(async (transaction) => {
        const identity = await transaction.pmcStudentIdentity.findUnique({
          where: { email: validation.email }
        });
        if (identity && identity.gender !== gender) {
          throw new Error(`This MANIT email is registered as ${identity.gender === 'female' ? 'a girl' : 'a boy'}. Re-registration must use the same gender.`);
        }
        if (!identity) {
          await transaction.pmcStudentIdentity.create({
            data: { email: validation.email, gender }
          });
        }
        await transaction.pmcUser.create({
          data: {
            id: newUser.id,
            email: newUser.email,
            anonymousName: newUser.anonymousName.toLowerCase(),
            leelaUsername: newUser.leelaUsername.toLowerCase(),
            scholarNo: newUser.scholarNo.toLowerCase(),
            data: { ...newUser, passwordHash }
          }
        });
      });
    } catch (error) {
      if (isAnonymousNameUniqueError(error)) {
        throw new Error('This anonymous persona name is already taken. Please choose another.');
      }
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw new Error('This college email is already registered. Please login.');
      }
      throw error;
    }

    this.clearOtp(validation.email);
    return newUser;
  }

  registerUser(userData) {
    return this.registerVerifiedUser(userData);
  }

  async requestAccountDeletion(userId) {
    const user = await this.client.pmcUser.findUnique({ where: { id: userId } });
    if (!user) return null;
    const existing = await this.client.pmcAccountDeletionRequest.findFirst({
      where: { userId, status: 'pending' }
    });
    if (existing) return existing;

    const requestedAt = new Date();
    try {
      return await this.client.pmcAccountDeletionRequest.create({
        data: {
          id: `deletion_${uuidv4()}`,
          userId,
          email: user.email,
          displayName: user.data.anonymousName || 'Student',
          gender: user.data.gender || 'male',
          requestedAt,
          deleteAfter: new Date(requestedAt.getTime() + 24 * 60 * 60 * 1000)
        }
      });
    } catch (error) {
      if (error.code === 'P2002') {
        const pending = await this.client.pmcAccountDeletionRequest.findFirst({
          where: { userId, status: 'pending' }
        });
        if (pending) return pending;
      }
      throw error;
    }
  }

  async getAccountDeletionRequestForUser(userId) {
    return this.client.pmcAccountDeletionRequest.findFirst({
      where: { userId, status: 'pending' },
      orderBy: { requestedAt: 'desc' }
    });
  }

  async getAccountDeletionRequests({ status = 'pending' } = {}) {
    return this.client.pmcAccountDeletionRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { requestedAt: 'asc' }
    });
  }

  async getDueAccountDeletionRequests(now = new Date()) {
    return this.client.pmcAccountDeletionRequest.findMany({
      where: { status: 'pending', deleteAfter: { lte: now } },
      orderBy: { deleteAfter: 'asc' }
    });
  }

  async rejectAccountDeletionRequest(requestId) {
    const result = await this.client.pmcAccountDeletionRequest.updateMany({
      where: { id: requestId, status: 'pending' },
      data: { status: 'rejected', resolvedAt: new Date() }
    });
    if (!result.count) return null;
    return this.client.pmcAccountDeletionRequest.findUnique({ where: { id: requestId } });
  }

  async completeAccountDeletionRequest(requestId, status = 'approved') {
    return this.client.$transaction(async (transaction) => {
      const claim = await transaction.pmcAccountDeletionRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status: 'processing' }
      });
      if (!claim.count) return null;
      const request = await transaction.pmcAccountDeletionRequest.findUnique({
        where: { id: requestId }
      });
      if (!request) return null;

      const user = await transaction.pmcUser.findUnique({ where: { id: request.userId } });
      let deletedUser = null;
      let reels = [];
      if (user) {
        deletedUser = user.data;
        reels = await transaction.pmcReel.findMany({
          where: { creatorId: request.userId },
          select: { data: true }
        });
        await transaction.pmcReel.deleteMany({ where: { creatorId: request.userId } });
        await transaction.pmcUser.delete({ where: { id: request.userId } });
      }

      const updatedRequest = await transaction.pmcAccountDeletionRequest.update({
        where: { id: requestId },
        data: { status, resolvedAt: new Date() }
      });
      const deletedReelFiles = [];
      const deletedReelStorageKeys = [];
      for (const { data } of reels) {
        if (data.videoStorageKey) deletedReelStorageKeys.push(data.videoStorageKey);
        if (data.videoUrl && data.videoUrl.includes('/uploads/')) {
          const filename = data.videoUrl.split('/uploads/').pop();
          if (filename) deletedReelFiles.push(filename);
        }
      }
      return {
        deletedUser,
        deletedReelFiles,
        deletedReelStorageKeys,
        request: updatedRequest
      };
    });
  }

  async loginUser(identifier, password) {
    const user = await this.findUserByIdentifier(identifier);
    if (!user) throw new Error(ACCOUNT_NOT_FOUND);
    const passwordMatches = user.passwordHash
      ? await verifyPassword(password.trim(), user.passwordHash)
      : user.password === password.trim();
    if (!passwordMatches) throw new Error('Incorrect password. Please try again.');
    if (!user.academicYear) {
      user.academicYear = this.getAcademicYearFromScholarNo(user.scholarNo);
    }
    delete user.password;
    delete user.passwordHash;
    return user;
  }

  async updatePasswordByEmail(email, password) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.client.pmcUser.findUnique({ where: { email: normalizedEmail } });
    if (!user) return null;

    const passwordHash = await hashPassword(password);
    const data = { ...user.data, passwordHash };
    delete data.password;
    const updated = await this.client.pmcUser.update({
      where: { email: normalizedEmail },
      data: { data }
    });
    return updated.data;
  }

  async updateUsernames(userId, { anonymousName, leelaUsername }) {
    const user = await this.client.pmcUser.findUnique({ where: { id: userId } });
    if (!user) return null;

    const chatName = typeof anonymousName === 'string'
      ? anonymousName.trim()
      : user.data.anonymousName;
    const reelName = typeof leelaUsername === 'string'
      ? leelaUsername.trim()
      : user.data.leelaUsername;
    if (!chatName || !reelName) {
      throw new Error('Both PMC chat and Leela usernames are required.');
    }
    if (chatName.length > 30 || reelName.length > 30) {
      throw new Error('Usernames cannot exceed 30 characters.');
    }
    if (chatName.toLowerCase() === reelName.toLowerCase()) {
      throw new Error('Your Leela username must be different from your PMC chat username.');
    }

    const [existingChatUser, existingLeelaUser] = await Promise.all([
      this.client.pmcUser.findFirst({
        where: {
          anonymousName: chatName.toLowerCase(),
          NOT: { id: userId }
        }
      }),
      this.client.pmcUser.findFirst({
        where: {
          leelaUsername: reelName.toLowerCase(),
          NOT: { id: userId }
        }
      })
    ]);
    if (existingChatUser) {
      throw new Error('This PMC chat username is already taken. Please choose another.');
    }
    if (existingLeelaUser) {
      throw new Error('This Leela username is already taken. Please choose another.');
    }

    const data = { ...user.data, anonymousName: chatName, leelaUsername: reelName };
    try {
      const updated = await this.client.pmcUser.update({
        where: { id: userId },
        data: {
          anonymousName: chatName.toLowerCase(),
          leelaUsername: reelName.toLowerCase(),
          data
        }
      });
      return updated.data;
    } catch (error) {
      if (isAnonymousNameUniqueError(error)) {
        throw new Error('This PMC chat username is already taken. Please choose another.');
      }
      if (isLeelaUsernameUniqueError(error)) {
        throw new Error('This Leela username is already taken. Please choose another.');
      }
      throw error;
    }
  }

  async reportPmcChatUser(reporterId, reportedUserId, reason) {
    try {
      return await this.client.$transaction(async (transaction) => {
        const [reporter, reportedUser] = await Promise.all([
          transaction.pmcUser.findUnique({ where: { id: reporterId } }),
          transaction.pmcUser.findUnique({ where: { id: reportedUserId } })
        ]);
        if (!reporter || !reportedUser) return null;
        if (reporter.data.gender !== 'female') {
          throw new Error('Only female students can report accounts from PMC chat.');
        }
        if (reporterId === reportedUserId) {
          throw new Error('You cannot report your own account.');
        }

        const now = Date.now();
        const existingBlock = Date.parse(reportedUser.data.pmcChatBlockedUntil || '');
        const blockedUntil = new Date(
          Math.max(now + 2 * 24 * 60 * 60 * 1000, Number.isFinite(existingBlock) ? existingBlock : 0)
        );
        await transaction.pmcUser.update({
          where: { id: reportedUserId },
          data: {
            data: {
              ...reportedUser.data,
              pmcChatBlockedUntil: blockedUntil.toISOString()
            }
          }
        });
        await transaction.pmcChatReport.create({
          data: {
            id: `chat_report_${uuidv4()}`,
            reporterId,
            reportedUserId,
            reason,
            blockedUntil
          }
        });
        return { blockedUntil: blockedUntil.toISOString() };
      });
    } catch (error) {
      if (error.code === 'P2003' || error.code === 'P2025') return null;
      throw error;
    }
  }

  async updateUserAvatar(userId, avatarStorageKey) {
    const user = await this.client.pmcUser.findUnique({ where: { id: userId } });
    if (!user) return null;

    const data = { ...user.data, avatarStorageKey };
    const updated = await this.client.pmcUser.update({
      where: { id: userId },
      data: { data }
    });
    return updated.data;
  }

  async deleteUser(userId) {
    return this.client.$transaction(async (transaction) => {
      const user = await transaction.pmcUser.findUnique({ where: { id: userId } });
      if (!user) return null;
      const reels = await transaction.pmcReel.findMany({
        where: { creatorId: userId },
        select: { data: true }
      });
      await transaction.pmcReel.deleteMany({ where: { creatorId: userId } });
      await transaction.pmcUser.delete({ where: { id: userId } });

      const deletedReelFiles = [];
      const deletedReelStorageKeys = [];
      for (const { data } of reels) {
        if (data.videoStorageKey) deletedReelStorageKeys.push(data.videoStorageKey);
        if (data.videoUrl && data.videoUrl.includes('/uploads/')) {
          const filename = data.videoUrl.split('/uploads/').pop();
          if (filename) deletedReelFiles.push(filename);
        }
      }
      return { deletedUser: user.data, deletedReelFiles, deletedReelStorageKeys };
    });
  }

  async registerPushToken(userId, token, platform) {
    const user = await this.client.pmcUser.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return null;
    return this.client.pmcPushToken.upsert({
      where: { token },
      create: { token, userId, platform },
      update: { userId, platform }
    });
  }

  async getPushTokens() {
    return this.client.pmcPushToken.findMany({ select: { token: true, userId: true } });
  }

  async removePushTokens(tokens) {
    if (!tokens.length) return;
    await this.client.pmcPushToken.deleteMany({ where: { token: { in: tokens } } });
  }

  async removePushTokenForUser(userId, token) {
    await this.client.pmcPushToken.deleteMany({ where: { userId, token } });
  }

  async addAnnouncement({ id, title, message }) {
    return this.client.pmcAnnouncement.create({ data: { id, title, message } });
  }

  async getAnnouncements(limit = null) {
    return this.client.pmcAnnouncement.findMany({
      orderBy: { createdAt: 'desc' },
      ...(limit == null ? {} : { take: limit })
    });
  }

  async deleteAnnouncement(id) {
    const result = await this.client.pmcAnnouncement.deleteMany({ where: { id } });
    return result.count > 0;
  }

  async addAppRelease(release) {
    return this.client.pmcAppRelease.create({ data: release });
  }

  async getAppRelease() {
    return this.client.pmcAppRelease.findFirst({ orderBy: { versionCode: 'desc' } });
  }

  async getAppReleases(limit = 10) {
    return this.client.pmcAppRelease.findMany({
      orderBy: { versionCode: 'desc' },
      take: limit
    });
  }

  async getReels(userId) {
    const reels = await this.client.pmcReel.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { likes: true, comments: true } },
        likes: userId ? { where: { userId }, select: { userId: true } } : false,
        comments: { orderBy: { createdAt: 'desc' } }
      }
    });
    return reels.map(({ data, _count, likes, comments }) => ({
      ...data,
      likesCount: _count.likes,
      commentsCount: _count.comments,
      isLiked: (likes || []).length > 0,
      comments: comments.map((comment) => ({
        id: comment.id,
        user: comment.user,
        userYear: comment.userYear,
        text: comment.text,
        createdAt: comment.createdAt.toISOString()
      }))
    }));
  }

  async getReel(reelId) {
    const reel = await this.client.pmcReel.findUnique({ where: { id: reelId } });
    return reel?.data || null;
  }

  async deleteReel(reelId) {
    return this.client.$transaction(async (transaction) => {
      const reel = await transaction.pmcReel.findUnique({ where: { id: reelId } });
      if (!reel) return null;
      await transaction.pmcReel.delete({ where: { id: reelId } });
      await transaction.pmcAnnouncement.deleteMany({ where: { id: `reel_${reelId}` } });
      const deletedReelFiles = [];
      if (reel.data.videoUrl && reel.data.videoUrl.includes('/uploads/')) {
        const filename = reel.data.videoUrl.split('/uploads/').pop();
        if (filename) deletedReelFiles.push(filename);
      }
      return {
        deletedReel: reel.data,
        deletedReelFiles,
        deletedReelStorageKeys: reel.data.videoStorageKey ? [reel.data.videoStorageKey] : []
      };
    });
  }

  async getReelReports({ status } = {}) {
    const reports = await this.client.pmcReelReport.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { reel: true, reporter: true }
    });
    return reports.map(({ reel, reporter, ...report }) => ({
      ...report,
      reel: reel.data,
      reporter: reporter.data
    }));
  }

  async addReelReport(reelId, reporterId, reason) {
    try {
      const report = await this.client.pmcReelReport.create({
        data: { id: `report_${uuidv4()}`, reelId, reporterId, reason },
        include: { reel: true, reporter: true }
      });
      return {
        ...report,
        reel: report.reel.data,
        reporter: report.reporter.data
      };
    } catch (error) {
      if (error.code === 'P2002') return { duplicate: true };
      if (error.code === 'P2003' || error.code === 'P2025') return null;
      throw error;
    }
  }

  async updateReelReportStatus(reportId, status) {
    try {
      return await this.client.pmcReelReport.update({
        where: { id: reportId },
        data: { status, reviewedAt: new Date() }
      });
    } catch (error) {
      if (error.code === 'P2025') return null;
      throw error;
    }
  }

  async addReel({
    creatorId,
    creatorName,
    creatorYear,
    caption,
    videoUrl,
    videoStorageKey,
    audioTitle,
    tags,
    trimStart,
    trimEnd,
    cropMode
  }) {
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
      audioTitle: audioTitle || 'Original Audio',
      tags: tags || ['#PMC', '#MANIT', '#Leela'],
      comments: [],
      createdAt: new Date().toISOString()
    };

    await this.client.pmcReel.create({
      data: {
        id: newReel.id,
        creatorId: creatorId || null,
        createdAt: new Date(newReel.createdAt),
        data: newReel
      }
    });
    return newReel;
  }

  async toggleLike(reelId, userId) {
    return this.client.$transaction(async (transaction) => {
      const reels = await transaction.$queryRaw`
        SELECT "id" FROM "pmc_reels" WHERE "id" = ${reelId} FOR UPDATE
      `;
      if (reels.length === 0) return null;
      const existing = await transaction.pmcReelLike.findUnique({
        where: { reelId_userId: { reelId, userId } }
      });
      if (existing) {
        await transaction.pmcReelLike.delete({
          where: { reelId_userId: { reelId, userId } }
        });
      } else {
        await transaction.pmcReelLike.create({ data: { reelId, userId } });
      }
      const likesCount = await transaction.pmcReelLike.count({ where: { reelId } });
      return { isLiked: !existing, likesCount };
    });
  }

  async addComment(reelId, user, text, userYear) {
    const comment = {
      id: `c_${uuidv4()}`,
      user: user || 'Anonymous Student',
      userYear: userYear || 'Student',
      text
    };
    try {
      const savedComment = await this.client.pmcReelComment.create({
        data: {
          id: comment.id,
          reelId,
          user: comment.user,
          userYear: comment.userYear,
          text: comment.text
        }
      });
      comment.createdAt = savedComment.createdAt.toISOString();
    } catch (error) {
      if (error.code === 'P2003' || error.code === 'P2025') return null;
      throw error;
    }
    return comment;
  }

  async countReelComments(reelId) {
    return this.client.pmcReelComment.count({ where: { reelId } });
  }
}

module.exports = PrismaDB;
