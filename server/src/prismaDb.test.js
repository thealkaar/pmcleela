const test = require('node:test');
const assert = require('node:assert/strict');
const PrismaDB = require('./prismaDb');

test('account deletion uses an extended interactive transaction and returns media for cleanup', async () => {
  const db = Object.create(PrismaDB.prototype);
  const request = { id: 'deletion-1', userId: 'student-1' };
  const updatedRequest = { ...request, status: 'approved' };
  let transactionOptions;

  db.client = {
    $transaction: async (callback, options) => {
      transactionOptions = options;
      return callback({
        pmcAccountDeletionRequest: {
          updateMany: async () => ({ count: 1 }),
          findUnique: async () => request,
          update: async () => updatedRequest
        },
        pmcUser: {
          findUnique: async () => ({ data: { id: 'student-1' } }),
          delete: async () => ({})
        },
        pmcReel: {
          findMany: async () => [{
            id: 'reel-1',
            data: {
              videoStorageKey: 'reels/reel-1.mp4',
              videoUrl: 'https://example.test/uploads/reel-1.mp4'
            }
          }],
          deleteMany: async () => ({ count: 1 })
        },
        pmcUserNotification: {
          deleteMany: async () => ({ count: 1 })
        }
      });
    }
  };

  const deletion = await db.completeAccountDeletionRequest(request.id, 'approved');

  assert.deepEqual(transactionOptions, { maxWait: 10_000, timeout: 30_000 });
  assert.deepEqual(deletion, {
    deletedUser: { id: 'student-1' },
    deletedReelFiles: ['reel-1.mp4'],
    deletedReelStorageKeys: ['reels/reel-1.mp4'],
    request: updatedRequest
  });
});
