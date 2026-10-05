import { File } from 'expo-file-system';
import { getBaseUrl } from '../config';

const AVATAR_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export async function uploadAvatar(serverHost, authToken, asset) {
  if (!authToken || !asset?.uri) {
    throw new Error('A signed-in account and selected profile image are required.');
  }
  if (asset.mimeType && !AVATAR_MIME_TYPES.has(asset.mimeType)) {
    throw new Error('Choose a JPEG, PNG, or WebP profile image.');
  }
  if (asset.fileSize > 5 * 1024 * 1024) {
    throw new Error('Profile images must be 5 MB or smaller.');
  }

  const mimeExtension = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  const fileExtension = mimeExtension[asset.mimeType] ||
    asset.fileName?.match(/\.(jpe?g|png|webp)$/i)?.[1]?.replace('jpeg', 'jpg').replace('JPEG', 'jpg');
  if (!fileExtension) {
    throw new Error('Choose a JPEG, PNG, or WebP profile image.');
  }

  const fileName = `profile-avatar.${fileExtension.toLowerCase()}`;
  const body = new FormData();
  body.append('avatar', new File(asset.uri), fileName);

  const response = await fetch(`${getBaseUrl(serverHost)}/api/auth/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body
  });
  const result = await response.json();
  if (!response.ok || !result.success || !result.user) {
    throw new Error(result.message || `Profile image upload failed (${response.status}).`);
  }
  return result.user;
}
