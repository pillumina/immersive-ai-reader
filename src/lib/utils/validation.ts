import { ValidationResult } from '@/types/settings';

/**
 * 验证 API Key 格式
 */
export function validateApiKey(key: string): ValidationResult {
  if (!key || key.trim().length < 10) {
    return { valid: false, error: 'API key must be at least 10 characters' };
  }

  if (key.includes(' ') || key.includes('\n')) {
    return { valid: false, error: 'API key cannot contain spaces or newlines' };
  }

  return { valid: true };
}
