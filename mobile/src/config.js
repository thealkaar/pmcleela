import { Platform } from 'react-native';

// Default to machine local IP for physical phone connection, or localhost for web/simulators
export const DEFAULT_HOST = Platform.OS === 'web' ? 'localhost' : '10.68.7.167';
export const DEFAULT_PORT = '5000';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL.trim().replace(/\/+$/, '')
  : '';

export function getBaseUrl(host = DEFAULT_HOST, port = DEFAULT_PORT) {
  if (configuredApiUrl) return configuredApiUrl;
  return `http://${host}:${port}`;
}

export function getSocketUrl(host = DEFAULT_HOST, port = DEFAULT_PORT) {
  return getBaseUrl(host, port);
}
