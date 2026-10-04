import { Platform } from 'react-native';

// Default to machine local IP for physical phone connection, or localhost for web/simulators
export const DEFAULT_HOST = Platform.OS === 'web' ? 'localhost' : '10.68.7.167';
export const DEFAULT_PORT = '5000';

export function getBaseUrl(host = DEFAULT_HOST, port = DEFAULT_PORT) {
  return `http://${host}:${port}`;
}

export function getSocketUrl(host = DEFAULT_HOST, port = DEFAULT_PORT) {
  return `http://${host}:${port}`;
}
