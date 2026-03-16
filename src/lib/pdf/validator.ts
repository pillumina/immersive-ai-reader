import { ValidationResult } from '@/types/settings';
import { MAX_FILE_SIZE_BYTES } from '@/constants/limits';

/**
 * 验证 PDF 文件
 */
export function validatePDFFile(file: File): ValidationResult {
  // 1. 文件类型
  if (file.type !== 'application/pdf') {
    return { valid: false, error: 'Only PDF files are allowed' };
  }

  // 2. 文件大小
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: 'File size exceeds 100MB limit' };
  }

  // 3. 文件名安全
  if (file.name.includes('..') || file.name.includes('/')) {
    return { valid: false, error: 'Invalid file name' };
  }

  return { valid: true };
}
