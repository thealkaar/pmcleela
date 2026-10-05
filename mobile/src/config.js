import { Platform } from 'react-native';
import Constants from 'expo-constants';

const expoHost = Constants.expoConfig?.hostUri?.replace(/:\d+$/, '');

// Expo Go's development host is the same computer that should serve the local API.
export const DEFAULT_HOST = Platform.OS === 'web' ? 'localhost' : expoHost || '10.68.7.167';
export const DEFAULT_PORT = '5000';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL
  ? process.env.EXPO_PUBLIC_API_URL.trim().replace(/\/+$/, '')
  : '';
const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
const PRODUCTION_API_URL = 'https://pmcleela.onrender.com';

export const REEL_SHARE_BASE_URL = (
  process.env.EXPO_PUBLIC_SHARE_URL || (!isDevelopment && configuredApiUrl) || PRODUCTION_API_URL
).trim().replace(/\/+$/, '');

export function getBaseUrl(host = DEFAULT_HOST, port = DEFAULT_PORT) {
  if (!isDevelopment) return configuredApiUrl || PRODUCTION_API_URL;
  return `http://${host}:${port}`;
}

export function getSocketUrl(host = DEFAULT_HOST, port = DEFAULT_PORT) {
  return getBaseUrl(host, port);
}
