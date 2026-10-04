const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { promisify } = require('util');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
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

class PostgresDB {
  constructor(LocalDB) {
    this.localHelpers = new LocalDB({ useLocalFiles: false });
    const caCertificate = process.env.SUPABASE_DB_CA;
    const rejectUnauthorized = process.env.SUPABASE_DB_SSL_REJECT_UNAUTHORIZED !== 'false';
    if (!caCertificate && !rejectUnauthorized) {
      console.warn('[Supabase] TLS is encrypted, but the database certificate is not verified. Configure SUPABASE_DB_CA to enable certificate verification.');
    }
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized,
        ...(caCertificate ? { ca: caCertificate.replace(/\\n/g, '\n') } : {})
      },
      max: 3,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 30000
    });
    this.pool.on('error', (error) => {
      console.error('[Supabase] Unexpected idle database connection error:', error.message);
    });
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
    const schema = await fs.promises.readFile(SCHEMA_PATH, 'utf8');
    await this.pool.query(schema);
    await this.checkConnection();
    console.log('[Supabase] Database schema is ready.');
  }

  async checkConnection() {
    await this.pool.query('SELECT 1');
    return true;
  }

  async close() {
    await this.pool.end();
  }

  async findUserByEmail(email) {
    if (!email) return null;
    const result = await this.pool.query(
      'SELECT data FROM pmc_users WHERE email = lower($1)',
      [email.trim()]
    );
    return result.rows[0]?.data || null;
  }

  async findUserByPhone(phone) {
    if (!phone) return null;
    const cleanPhone = phone.trim().replace(/\D/g, '');
    const result = await this.pool.query(
      "SELECT data FROM pmc_users WHERE regexp_replace(coalesce(data->>'phone', ''), '[^0-9]', '', 'g') = $1 LIMIT 1",
      [cleanPhone]
    );
    return result.rows[0]?.data || null;
  }

  async findUserByAnonymousName(anonymousName) {
    if (!anonymousName) return null;
    const result = await this.pool.query(
      'SELECT data FROM pmc_users WHERE anonymous_name = lower($1)',
      [anonymousName.trim()]
    );
    return result.rows[0]?.data || null;
  }

  async findUserByIdentifier(identifier) {
    if (!identifier) return null;
    const term = identifier.trim().toLowerCase();
    const result = await this.pool.query(
      `SELECT data FROM pmc_users
       WHERE email = $1 OR anonymous_name = $1 OR scholar_no = $1
       LIMIT 1`,
      [term]
    );
    return result.rows[0]?.data || null;
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

    const existingEmail = await this.findUserByEmail(validation.email);
    if (existingEmail) throw new Error('This college email is already registered. Please login.');
    const existingName = await this.findUserByAnonymousName(cleanAnonymousName);
    if (existingName) throw new Error('This anonymous persona name is already taken. Please choose another.');

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
    newUser.passwordHash = await hashPassword(password.trim());

    try {
      await this.pool.query(
        `INSERT INTO pmc_users (id, email, anonymous_name, scholar_no, data)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [
          newUser.id,
          newUser.email,
          newUser.anonymousName.toLowerCase(),
          newUser.scholarNo.toLowerCase(),
          JSON.stringify(newUser)
        ]
      );
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'pmc_users_anonymous_name_key') {
        throw new Error('This anonymous persona name is already taken. Please choose another.');
      }
      if (error.code === '23505' && error.constraint === 'pmc_users_email_key') {
        throw new Error('This college email is already registered. Please login.');
      }
      throw error;
    }

    this.clearOtp(validation.email);
    delete newUser.passwordHash;
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
    const result = await this.pool.query(
      `UPDATE pmc_users
       SET anonymous_name = lower($2),
           data = jsonb_set(data - 'password' - 'passwordHash', '{anonymousName}', to_jsonb($2::text), true)
       WHERE id = $1
       RETURNING data`,
      [userId, cleanName]
    );
    return result.rows[0]?.data || null;
  }

  async deleteUser(userId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const userResult = await client.query(
        'SELECT data FROM pmc_users WHERE id = $1 FOR UPDATE',
        [userId]
      );
      if (!userResult.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }

      const reelResult = await client.query(
        'SELECT data FROM pmc_reels WHERE creator_id = $1 FOR UPDATE',
        [userId]
      );
      const deletedReelFiles = [];
      const deletedReelStorageKeys = [];
      for (const { data } of reelResult.rows) {
        if (data.videoStorageKey) deletedReelStorageKeys.push(data.videoStorageKey);
        if (data.videoUrl && data.videoUrl.includes('/uploads/')) {
          const filename = data.videoUrl.split('/uploads/').pop();
          if (filename) deletedReelFiles.push(filename);
        }
      }

      await client.query('DELETE FROM pmc_reels WHERE creator_id = $1', [userId]);
      await client.query('DELETE FROM pmc_users WHERE id = $1', [userId]);
      await client.query('COMMIT');
      return {
        deletedUser: userResult.rows[0].data,
        deletedReelFiles,
        deletedReelStorageKeys
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getReels() {
    const result = await this.pool.query('SELECT data FROM pmc_reels ORDER BY created_at DESC');
    return result.rows.map(row => row.data);
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

    await this.pool.query(
      'INSERT INTO pmc_reels (id, creator_id, created_at, data) VALUES ($1, $2, $3, $4::jsonb)',
      [newReel.id, creatorId || null, newReel.createdAt, JSON.stringify(newReel)]
    );
    return newReel;
  }

  async toggleLike(reelId) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT data FROM pmc_reels WHERE id = $1 FOR UPDATE', [reelId]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }

      const reel = result.rows[0].data;
      reel.isLiked = !reel.isLiked;
      reel.likesCount = Math.max(0, (Number(reel.likesCount) || 0) + (reel.isLiked ? 1 : -1));
      await client.query('UPDATE pmc_reels SET data = $2::jsonb WHERE id = $1', [reelId, JSON.stringify(reel)]);
      await client.query('COMMIT');
      return reel;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addComment(reelId, user, text, userYear) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT data FROM pmc_reels WHERE id = $1 FOR UPDATE', [reelId]);
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return null;
      }

      const reel = result.rows[0].data;
      const comment = {
        id: `c_${Date.now()}`,
        user: user || 'Anonymous Student',
        userYear: userYear || 'Student',
        text,
        time: 'Just now'
      };
      reel.comments = [comment, ...(reel.comments || [])];
      reel.commentsCount = reel.comments.length;
      await client.query('UPDATE pmc_reels SET data = $2::jsonb WHERE id = $1', [reelId, JSON.stringify(reel)]);
      await client.query('COMMIT');
      return comment;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = PostgresDB;
