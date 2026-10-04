const crypto = require('crypto');
const { promisify } = require('util');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

const ACCOUNT_NOT_FOUND = 'Account not found. Please check your Email / Scholar No / Anonymous Name or Register.';
const scrypt = promisify(crypto.scrypt);

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

  async findUserByPhone(phone) {
    if (!phone) return null;
    const cleanPhone = phone.trim().replace(/\D/g, '');
    const user = await this.client.pmcUser.findFirst({
      where: { phone: cleanPhone }
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

  async registerVerifiedUser({
    fullName,
    phone,
    email,
    password,
    gender,
    hostel,
    anonymousName,
    avatarUrl,
    academicYear
  }) {
    const validation = this.validateManitEmail(email);
    if (!validation.valid) throw new Error(validation.message);

    const cleanAnonymousName = (anonymousName || '').trim();
    if (!cleanAnonymousName) throw new Error('An anonymous persona name is required.');
    if (typeof password !== 'string' || !password.trim()) throw new Error('A password is required.');

    if (await this.findUserByEmail(validation.email)) {
      throw new Error('This college email is already registered. Please login.');
    }
    if (await this.findUserByAnonymousName(cleanAnonymousName)) {
      throw new Error('This anonymous persona name is already taken. Please choose another.');
    }

    const newUser = {
      id: `usr_${uuidv4().slice(0, 8)}`,
      email: validation.email,
      scholarNo: validation.scholarNo,
      fullName: (fullName || 'MANIT Student').trim(),
      phone: (phone || '').trim(),
      gender: gender || 'male',
      academicYear: academicYear || this.getAcademicYearFromScholarNo(validation.scholarNo),
      hostel: hostel || 'Campus Hostel',
      anonymousName: cleanAnonymousName,
      avatarUrl: avatarUrl || null,
      isEmailVerified: true,
      createdAt: new Date().toISOString()
    };
    const passwordHash = await hashPassword(password.trim());

    try {
      await this.client.pmcUser.create({
        data: {
          id: newUser.id,
          email: newUser.email,
          anonymousName: newUser.anonymousName.toLowerCase(),
          scholarNo: newUser.scholarNo.toLowerCase(),
          phone: newUser.phone.replace(/\D/g, '') || null,
          data: { ...newUser, passwordHash }
        }
      });
    } catch (error) {
      if (error.code === 'P2002' && error.meta?.target?.includes('anonymous_name')) {
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

  async updateUserPersona(userId, newAnonymousName) {
    const cleanName = newAnonymousName.trim();
    const user = await this.client.pmcUser.findUnique({ where: { id: userId } });
    if (!user) return null;

    const data = { ...user.data, anonymousName: cleanName };
    const updated = await this.client.pmcUser.update({
      where: { id: userId },
      data: { anonymousName: cleanName.toLowerCase(), data }
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
        time: 'Just now'
      }))
    }));
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
      text,
      time: 'Just now'
    };
    try {
      await this.client.pmcReelComment.create({
        data: {
          id: comment.id,
          reelId,
          user: comment.user,
          userYear: comment.userYear,
          text: comment.text
        }
      });
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
