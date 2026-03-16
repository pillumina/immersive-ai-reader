/**
 * 简单的 Base64 编码(用于 MVP)
 * 注意:这不是真正的加密,仅用于混淆
 */
export function encryptApiKey(key: string): string {
  return btoa(key);
}

/**
 * Base64 解码
 */
export function decryptApiKey(encrypted: string): string {
  try {
    return atob(encrypted);
  } catch (error) {
    console.error('Failed to decrypt API key:', error);
    return '';
  }
}

/**
 * 生成唯一 ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
