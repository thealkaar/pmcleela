const crypto = require('crypto');

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const LOCAL_SESSION_SECRET = 'local-only-pmc-leela-user-session-secret';

function getSessionSecret() {
  const configuredSecret = process.env.PMC_USER_SESSION_SECRET;
  if (configuredSecret && configuredSecret.length >= 32) return configuredSecret;
  if (process.env.NODE_ENV === 'production') return null;
  return LOCAL_SESSION_SECRET;
}

function isSessionAuthConfigured() {
  return Boolean(getSessionSecret());
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function issueUserToken(userId) {
  const secret = getSessionSecret();
  if (!secret) throw new Error('PMC_USER_SESSION_SECRET is not configured.');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    iat: now,
    exp: now + SESSION_TTL_SECONDS
  })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

function verifyUserToken(token) {
  const secret = getSessionSecret();
  if (!secret || typeof token !== 'string' || token.length > 4096) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra || !safeEqual(signature, sign(payload, secret))) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof claims.sub !== 'string' ||
      !claims.sub ||
      !Number.isInteger(claims.exp) ||
      claims.exp <= now ||
      !Number.isInteger(claims.iat) ||
      claims.iat > now + 60
    ) {
      return null;
    }
    return claims;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function getBearerToken(req) {
  const match = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function sendAuthUnavailable(res) {
  return res.status(503).json({
    success: false,
    message: 'Student sign-in is temporarily unavailable. Please contact the app administrator.'
  });
}

function requireUser(db) {
  return async (req, res, next) => {
    if (!isSessionAuthConfigured()) return sendAuthUnavailable(res);
    const claims = verifyUserToken(getBearerToken(req));
    if (!claims) {
      return res.status(401).json({ success: false, message: 'Your sign-in has expired. Please sign in again.' });
    }
    try {
      const user = await db.findUserById(claims.sub);
      if (!user) {
        return res.status(401).json({ success: false, message: 'Your account is no longer available. Please sign in again.' });
      }
      req.studentUser = user;
      return next();
    } catch (error) {
      console.error('[Auth] Could not verify student account:', error);
      return res.status(500).json({ success: false, message: 'Could not verify your student account.' });
    }
  };
}

function optionalUser(db) {
  return async (req, res, next) => {
    const token = getBearerToken(req);
    if (!token) return next();
    if (!isSessionAuthConfigured()) return sendAuthUnavailable(res);
    const claims = verifyUserToken(token);
    if (!claims) {
      return res.status(401).json({ success: false, message: 'Your sign-in has expired. Please sign in again.' });
    }
    try {
      req.studentUser = await db.findUserById(claims.sub);
      if (!req.studentUser) {
        return res.status(401).json({ success: false, message: 'Your account is no longer available. Please sign in again.' });
      }
      return next();
    } catch (error) {
      console.error('[Auth] Could not verify student account:', error);
      return res.status(500).json({ success: false, message: 'Could not verify your student account.' });
    }
  };
}

module.exports = {
  SESSION_TTL_SECONDS,
  getSessionSecret,
  isSessionAuthConfigured,
  issueUserToken,
  verifyUserToken,
  requireUser,
  optionalUser
};
