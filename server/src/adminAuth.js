const crypto = require('crypto');

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

function getAdminConfig() {
  const email = process.env.PMC_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PMC_ADMIN_PASSWORD;
  const sessionSecret = process.env.PMC_ADMIN_SESSION_SECRET;
  if (!email || !password || !sessionSecret) return null;
  if (sessionSecret.length < 32) {
    throw new Error('PMC_ADMIN_SESSION_SECRET must contain at least 32 characters.');
  }
  return { email, password, sessionSecret };
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function issueAdminToken(email, secret) {
  const payload = Buffer.from(JSON.stringify({
    email,
    expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS
  })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function verifyAdminToken(token, secret) {
  if (typeof token !== 'string') return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  if (!safeEqual(signature, sign(payload, secret))) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof claims.email !== 'string' || claims.expiresAt <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    return claims;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function getAttemptRecord(key) {
  const now = Date.now();
  const existing = loginAttempts.get(key);
  if (!existing || now - existing.windowStartedAt >= LOGIN_WINDOW_MS) {
    const fresh = { count: 0, windowStartedAt: now, blockedUntil: 0 };
    loginAttempts.set(key, fresh);
    return fresh;
  }
  return existing;
}

function loginAdmin(req, res) {
  const config = getAdminConfig();
  if (!config) {
    return res.status(503).json({
      success: false,
      message: 'Admin login is not configured on the server.'
    });
  }

  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const attempt = getAttemptRecord(key);
  if (attempt.blockedUntil > Date.now()) {
    return res.status(429).json({
      success: false,
      message: 'Too many admin login attempts. Please wait and try again.'
    });
  }

  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const valid = safeEqual(email, config.email) && safeEqual(password, config.password);
  if (!valid) {
    attempt.count += 1;
    if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
      attempt.blockedUntil = Date.now() + LOGIN_WINDOW_MS;
    }
    console.warn(`[Admin] Failed login attempt from ${key}`);
    return res.status(401).json({ success: false, message: 'Admin email or password is incorrect.' });
  }

  loginAttempts.delete(key);
  console.info(`[Admin] Successful sign-in for ${config.email}`);
  return res.json({
    success: true,
    token: issueAdminToken(config.email, config.sessionSecret),
    expiresIn: SESSION_TTL_SECONDS
  });
}

function requireAdmin(req, res, next) {
  const config = getAdminConfig();
  if (!config) {
    return res.status(503).json({
      success: false,
      message: 'Admin access is not configured on the server.'
    });
  }

  const authorization = req.get('authorization') || '';
  const match = authorization.match(/^Bearer ([^\s]+)$/);
  const claims = match ? verifyAdminToken(match[1], config.sessionSecret) : null;
  if (!claims || !safeEqual(claims.email, config.email)) {
    return res.status(401).json({ success: false, message: 'Admin sign-in has expired. Please sign in again.' });
  }
  req.adminEmail = claims.email;
  return next();
}

module.exports = { loginAdmin, requireAdmin };
