-- Add reading progress: last_page column to documents table
ALTER TABLE documents ADD COLUMN last_page INTEGER NOT NULL DEFAULT 1;
