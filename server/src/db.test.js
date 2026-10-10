const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const { LocalDB } = require('./db');

function createTestDb() {
  const db = Object.create(LocalDB.prototype);
  db.users = [
    { id: 'student-girl', gender: 'female', email: 'girl@stu.manit.ac.in', anonymousName: 'Chat Girl', leelaUsername: 'LeelaGirl' },
    { id: 'student-boy', gender: 'male', email: 'boy@stu.manit.ac.in', anonymousName: 'Chat Boy', leelaUsername: 'LeelaBoy' },
    { id: 'student-other', gender: 'male', email: 'other@stu.manit.ac.in', anonymousName: 'Other Chat', leelaUsername: 'OtherLeela' }
  ];
  db.chatReports = [];
  db.reports = [];
  db.pushTokens = [];
  db.reels = [];
  db.studentIdentities = [{ email: 'girl@stu.manit.ac.in', gender: 'female' }];
  db.accountDeletionRequests = [];
  db.refreshUsers = () => {};
  db.findUserById = userId => db.users.find(user => user.id === userId) || null;
  return db;
}

test('scholar-number login resolves the account registered with its MANIT email', () => {
  const db = createTestDb();
  const user = db.users[0];
  user.scholarNo = '260123456';
  user.password = 'test-password';

  assert.equal(db.findUserByIdentifier('260123456'), user);
  assert.equal(db.loginUser('260123456', 'test-password'), user);
  assert.deepEqual(db.validateManitEmail('260123456@stu.manit.ac.in'), {
    valid: true,
    email: '260123456@stu.manit.ac.in',
    scholarNo: '260123456'
  });
});

test('global notification setting can be enabled and disabled with persistence', () => {
  const originalWriteFileSync = fs.writeFileSync;
  const writes = [];
  fs.writeFileSync = (file, data) => writes.push({ file, data });
  try {
    const db = createTestDb();
    db.notificationsEnabled = true;
    assert.equal(db.getNotificationsEnabled(), true);
    assert.equal(db.setNotificationsEnabled(false), false);
    assert.equal(db.getNotificationsEnabled(), false);
    assert.deepEqual(JSON.parse(writes[0].data), { notificationsEnabled: false });
    assert.equal(db.setNotificationsEnabled(true), true);
    assert.equal(db.getNotificationsEnabled(), true);
    assert.deepEqual(JSON.parse(writes[1].data), { notificationsEnabled: true });
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
});

test('global notification setting reverts in-memory state when persistence fails', () => {
  const originalWriteFileSync = fs.writeFileSync;
  const originalConsoleError = console.error;
  fs.writeFileSync = () => {
    throw new Error('disk unavailable');
  };
  console.error = () => {};
  try {
    const db = createTestDb();
    db.notificationsEnabled = true;
    assert.throws(() => db.setNotificationsEnabled(false), /Could not persist notification settings/);
    assert.equal(db.getNotificationsEnabled(), true);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
    console.error = originalConsoleError;
  }
});

test('chat and Leela usernames remain separate and unique', () => {
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = () => {};
  try {
    const db = createTestDb();
    const updated = db.updateUsernames('student-girl', {
      anonymousName: 'New Chat Name',
      leelaUsername: 'NewLeelaName'
    });
    assert.equal(updated.anonymousName, 'New Chat Name');
    assert.equal(updated.leelaUsername, 'NewLeelaName');
    assert.throws(
      () => db.updateUsernames('student-girl', {
        anonymousName: 'New Chat Name',
        leelaUsername: 'new chat name'
      }),
      /must be different/
    );
    assert.throws(
      () => db.updateUsernames('student-girl', {
        anonymousName: 'CHAT BOY',
        leelaUsername: 'UniqueLeela'
      }),
      /PMC chat username is already taken/
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
});

test('account deletion requests are unique while pending and retain the 24-hour deadline', () => {
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = () => {};
  try {
    const db = createTestDb();
    const request = db.requestAccountDeletion('student-girl');
    const repeatedRequest = db.requestAccountDeletion('student-girl');

    assert.equal(repeatedRequest.id, request.id);
    assert.equal(db.accountDeletionRequests.length, 1);
    assert.equal(Date.parse(request.deleteAfter) - Date.parse(request.requestedAt), 24 * 60 * 60 * 1000);
    assert.equal(db.getAccountDeletionRequestForUser('student-girl').id, request.id);
    assert.equal(db.getDueAccountDeletionRequests(new Date(request.deleteAfter)).length, 1);
    assert.ok(db.users.some(user => user.id === 'student-girl'));
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
});

test('rejecting a deletion request retains the account and closes the pending request', () => {
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = () => {};
  try {
    const db = createTestDb();
    const request = db.requestAccountDeletion('student-girl');
    const rejected = db.rejectAccountDeletionRequest(request.id);

    assert.equal(rejected.status, 'rejected');
    assert.equal(db.getAccountDeletionRequestForUser('student-girl'), null);
    assert.ok(db.users.some(user => user.id === 'student-girl'));
    assert.equal(db.rejectAccountDeletionRequest(request.id), null);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
});

test('approving a deletion removes the account and its reels but preserves the gender lock', () => {
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = () => {};
  try {
    const db = createTestDb();
    db.reels = [
      { id: 'owned-reel', creatorId: 'student-girl', videoStorageKey: 'reel.mp4' },
      { id: 'other-reel', creatorId: 'student-boy' }
    ];
    const request = db.requestAccountDeletion('student-girl');
    const deletion = db.completeAccountDeletionRequest(request.id, 'approved');

    assert.equal(deletion.request.status, 'approved');
    assert.equal(db.findUserById('student-girl'), null);
    assert.deepEqual(db.reels.map(reel => reel.id), ['other-reel']);
    assert.deepEqual(db.studentIdentities, [{ email: 'girl@stu.manit.ac.in', gender: 'female' }]);
    assert.equal(db.completeAccountDeletionRequest(request.id, 'approved'), null);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
});

test('a deleted student cannot re-register with a different gender', () => {
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = () => {};
  try {
    const db = createTestDb();
    db.deleteUser('student-girl');
    assert.throws(
      () => db.registerVerifiedUser({
        email: 'girl@stu.manit.ac.in',
        password: 'password',
        gender: 'male',
        anonymousName: 'New Chat Name'
      }),
      /must use the same gender/
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
});

test('female PMC chat reports impose a persistent 48-hour block', () => {
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = () => {};
  try {
    const db = createTestDb();
    const result = db.reportPmcChatUser('student-girl', 'student-boy', 'Safety concern in PMC chat');
    const remaining = Date.parse(result.blockedUntil) - Date.now();
    assert.ok(remaining >= 48 * 60 * 60 * 1000 - 100);
    assert.ok(remaining <= 48 * 60 * 60 * 1000 + 100);
    assert.equal(db.users[1].pmcChatBlockedUntil, result.blockedUntil);
    assert.equal(db.chatReports.length, 1);
    assert.throws(
      () => db.reportPmcChatUser('student-boy', 'student-other', 'Safety concern in PMC chat'),
      /Only female students/
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
});

test('female PMC chat reporters can report only once in a rolling 24-hour period', () => {
  const originalWriteFileSync = fs.writeFileSync;
  fs.writeFileSync = () => {};
  try {
    const db = createTestDb();
    db.reportPmcChatUser('student-girl', 'student-boy', 'Safety concern in PMC chat');

    assert.throws(
      () => db.reportPmcChatUser('student-girl', 'student-other', 'Safety concern in PMC chat'),
      /only one PMC chat report every 24 hours/
    );
    assert.equal(db.chatReports.length, 1);

    db.chatReports[0].createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1).toISOString();
    const nextReport = db.reportPmcChatUser('student-girl', 'student-other', 'Safety concern in PMC chat');
    assert.ok(nextReport.blockedUntil);
    assert.equal(db.chatReports.length, 2);
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }
});
