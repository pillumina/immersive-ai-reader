-- Migration: 003_add_file_path_index
-- Add index on documents.file_path for fast duplicate-check lookups on upload.

CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path);
