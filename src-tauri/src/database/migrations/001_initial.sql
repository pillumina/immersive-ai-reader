-- Initial database schema
-- Migration: 001_initial

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    page_count INTEGER NOT NULL,
    text_content TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_file_name ON documents(file_name);

-- Annotations table
CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('highlight')),
    color TEXT NOT NULL,
    position_x REAL NOT NULL,
    position_y REAL NOT NULL,
    position_width REAL NOT NULL,
    position_height REAL NOT NULL,
    text TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_annotations_document_id ON annotations(document_id);
CREATE INDEX IF NOT EXISTS idx_annotations_page_number ON annotations(page_number);

-- Notes table
CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    annotation_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notes_annotation_id ON notes(annotation_id);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_document_id ON conversations(document_id);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

-- Settings table
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
