/**
 * Maximum file size for PDF uploads (in megabytes)
 * Limited by browser memory constraints
 */
export const MAX_FILE_SIZE_MB = 100;

/**
 * Maximum file size in bytes (100 MB)
 * Used for file validation before upload
 */
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/**
 * Maximum number of pages supported
 * Prevents performance issues with very large documents
 */
export const MAX_PAGE_COUNT = 500;

/**
 * Maximum conversation messages to retain
 * Balances context window and response quality
 */
export const MAX_CONVERSATION_HISTORY = 50;

/**
 * Number of pages to process in a single batch
 * Optimizes PDF parsing performance
 */
export const BATCH_PAGE_SIZE = 50;
