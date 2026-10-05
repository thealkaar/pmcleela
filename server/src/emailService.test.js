const test = require('node:test');
const assert = require('node:assert/strict');
const { sendOtpEmail, sendPasswordResetEmail } = require('./emailService');

function withEnvironment(values, callback) {
  const previous = new Map();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test('verification email sends the premium inline design and verification code', async () => {
  const originalFetch = global.fetch;
  let payload;
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ messageId: 'test-message' }), { status: 201 });
  };
  try {
    await withEnvironment({
      NODE_ENV: 'production',
      BREVO_API_KEY: 'test-key',
      FROM_EMAIL: 'verified@example.com',
      FROM_NAME: 'PMC Leela',
      BREVO_OTP_TEMPLATE_ID: 'unused-template',
      BREVO_PASSWORD_RESET_TEMPLATE_ID: 'unused-template'
    }, async () => {
      const result = await sendOtpEmail('student@stu.manit.ac.in', '123456');
      assert.equal(result.success, true);
      assert.equal(payload.to[0].email, 'student@stu.manit.ac.in');
      assert.match(payload.subject, /Verification code/);
      assert.match(payload.htmlContent, /Welcome to PMC Leela/);
      assert.match(payload.htmlContent, /123456/);
      assert.match(payload.htmlContent, /expires in 10 minutes/);
      assert.match(payload.htmlContent, /_alkaar_/);
      assert.equal('templateId' in payload, false);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('password reset uses its own inline copy and safe account guidance', async () => {
  const originalFetch = global.fetch;
  let payload;
  global.fetch = async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ messageId: 'reset-message' }), { status: 201 });
  };
  try {
    await withEnvironment({
      NODE_ENV: 'production',
      BREVO_API_KEY: 'test-key',
      FROM_EMAIL: 'verified@example.com',
      FROM_NAME: 'PMC Leela',
      BREVO_OTP_TEMPLATE_ID: null,
      BREVO_PASSWORD_RESET_TEMPLATE_ID: null
    }, async () => {
      const result = await sendPasswordResetEmail('student@stu.manit.ac.in', '654321');
      assert.equal(result.success, true);
      assert.match(payload.subject, /Password reset code/);
      assert.match(payload.htmlContent, /reset your account password/);
      assert.match(payload.htmlContent, /654321/);
      assert.match(payload.htmlContent, /existing password has not been sent or changed/);
      assert.equal('templateId' in payload, false);
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('Brevo provider rejection is returned to the caller', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ message: 'Sender not verified' }), { status: 400 });
  try {
    await withEnvironment({
      NODE_ENV: 'production',
      BREVO_API_KEY: 'test-key',
      FROM_EMAIL: 'verified@example.com'
    }, async () => {
      const result = await sendPasswordResetEmail('student@stu.manit.ac.in', '654321');
      assert.equal(result.success, false);
      assert.equal(result.error, 'Sender not verified');
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('production email fails explicitly if Brevo settings are missing', async () => {
  await withEnvironment({
    NODE_ENV: 'production',
    BREVO_API_KEY: null,
    FROM_EMAIL: null
  }, async () => {
    const result = await sendOtpEmail('student@stu.manit.ac.in', '123456');
    assert.equal(result.success, false);
    assert.match(result.error, /BREVO_API_KEY and FROM_EMAIL/);
  });
});
