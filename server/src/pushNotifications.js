const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH_SIZE = 100;

function chunks(items, size) {
  const batches = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

async function sendPushToAll(tokens, { title, body, data }) {
  const uniqueTokens = [...new Set(tokens.map(item => item.token))];
  const result = { sent: 0, failed: 0, invalidTokens: [], errors: [] };
  if (process.env.PMC_LOCAL_MODE === '1') {
    result.failed = uniqueTokens.length;
    if (uniqueTokens.length) result.errors.push('Push notifications are disabled in local development mode.');
    return result;
  }

  for (const batch of chunks(uniqueTokens, BATCH_SIZE)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(batch.map(to => ({
          to,
          title,
          body,
          sound: 'default',
          channelId: 'announcements',
          data
        })))
      });
      const payload = await response.json();
      if (!response.ok || payload.errors?.length) {
        throw new Error(payload.errors?.[0]?.message || `Expo push service returned ${response.status}.`);
      }

      for (let index = 0; index < batch.length; index += 1) {
        const ticket = payload.data?.[index];
        if (ticket?.status === 'ok') {
          result.sent += 1;
          continue;
        }
        result.failed += 1;
        const errorCode = ticket?.details?.error;
        if (errorCode === 'DeviceNotRegistered') result.invalidTokens.push(batch[index]);
        if (result.errors.length < 5) result.errors.push(ticket?.message || errorCode || 'Push delivery failed.');
      }
    } catch (error) {
      result.failed += batch.length;
      if (result.errors.length < 5) result.errors.push(error.message);
      console.error('[Push] Expo push batch failed:', error.message);
    }
  }

  return result;
}

module.exports = { sendPushToAll };
