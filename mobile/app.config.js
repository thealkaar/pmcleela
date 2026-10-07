const DEFAULT_API_URL = 'https://pmcleela.onrender.com';

module.exports = ({ config }) => {
  const shareUrl = (
    process.env.EXPO_PUBLIC_SHARE_URL
    || process.env.EXPO_PUBLIC_API_URL
    || DEFAULT_API_URL
  ).trim();

  let shareHost;
  try {
    const parsedUrl = new URL(shareUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Use an HTTP or HTTPS URL.');
    }
    shareHost = parsedUrl.hostname;
  } catch (error) {
    throw new Error(`Invalid EXPO_PUBLIC_SHARE_URL or EXPO_PUBLIC_API_URL: ${error.message}`);
  }

  const android = config.android || {};
  return {
    ...config,
    android: {
      ...android,
      intentFilters: (android.intentFilters || []).map((filter) => ({
        ...filter,
        data: (filter.data || []).map((item) => (
          item.scheme === 'https' && item.host
            ? { ...item, host: shareHost }
            : item
        ))
      }))
    }
  };
};
