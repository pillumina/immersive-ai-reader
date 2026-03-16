import { validatePDFFile } from '@/lib/pdf/validator';
import { checkPageLimit } from '@/lib/pdf/parser';

describe('PDF Parser', () => {
  it('should validate PDF file type', () => {
    const file = new File([''], 'test.txt', { type: 'text/plain' });
    const result = validatePDFFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Only PDF files');
  });

  it('should validate file size', () => {
    const largeContent = 'x'.repeat(101 * 1024 * 1024);
    const largeFile = new File([largeContent], 'large.pdf', {
      type: 'application/pdf',
    });
    const result = validatePDFFile(largeFile);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds');
  });

  it('should reject invalid file names', () => {
    const file = new File([''], '../test.pdf', { type: 'application/pdf' });
    const result = validatePDFFile(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid file name');
  });

  it('should accept valid PDF files', () => {
    const file = new File(['test content'], 'test.pdf', {
      type: 'application/pdf',
    });
    const result = validatePDFFile(file);
    expect(result.valid).toBe(true);
  });
});
