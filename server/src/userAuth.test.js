const test = require('node:test');
const assert = require('node:assert/strict');
const {
  issueUserToken,
  verifyUserToken,
  requireUser
} = require('./userAuth');

test('signed student tokens resolve to their account ID', () => {
  const token = issueUserToken('student-123');
  assert.equal(verifyUserToken(token)?.sub, 'student-123');
});

test('tampered student tokens are rejected', () => {
  const token = issueUserToken('student-123');
  const [payload, signature] = token.split('.');
  const tamperedSignature = `${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`;
  const tamperedToken = `${payload}.${tamperedSignature}`;
  assert.equal(verifyUserToken(tamperedToken), null);
});

test('tokens signed with a different secret are rejected', () => {
  const originalSecret = process.env.PMC_USER_SESSION_SECRET;
  try {
    process.env.PMC_USER_SESSION_SECRET = 'first-test-secret-that-is-at-least-32-characters';
    const token = issueUserToken('student-123');
    process.env.PMC_USER_SESSION_SECRET = 'second-test-secret-that-is-at-least-32-characters';
    assert.equal(verifyUserToken(token), null);
  } finally {
    if (originalSecret === undefined) delete process.env.PMC_USER_SESSION_SECRET;
    else process.env.PMC_USER_SESSION_SECRET = originalSecret;
  }
});

test('protected routes reject requests without a bearer session', async () => {
  const middleware = requireUser({
    findUserById: async () => {
      throw new Error('Database lookup should not run without a token.');
    }
  });
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  let nextCalled = false;
  await middleware({ get: () => '' }, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('protected routes bind the request to the account in the signed session', async () => {
  const account = { id: 'student-123' };
  const token = issueUserToken(account.id);
  const middleware = requireUser({
    findUserById: async (userId) => userId === account.id ? account : null
  });
  const request = { get: () => `Bearer ${token}` };
  const response = {
    status(code) {
      throw new Error(`Unexpected response status: ${code}`);
    },
    json(body) {
      throw new Error(`Unexpected response: ${JSON.stringify(body)}`);
    }
  };
  let nextCalled = false;
  await middleware(request, response, () => { nextCalled = true; });
  assert.equal(request.studentUser, account);
  assert.equal(nextCalled, true);
});
