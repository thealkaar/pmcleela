const test = require('node:test');
const assert = require('node:assert/strict');
const { sendPushToAll } = require('./pushNotifications');

test('disabled global notifications suppress delivery to every registered token', async () => {
  const result = await sendPushToAll(
    [{ token: 'ExpoPushToken[one]' }, { token: 'ExpoPushToken[two]' }],
    { title: 'New reel', body: 'A reel was published', data: { type: 'reel' } },
    { enabled: false }
  );

  assert.deepEqual(result, {
    sent: 0,
    failed: 0,
    invalidTokens: [],
    errors: [],
    disabled: true
  });
});
