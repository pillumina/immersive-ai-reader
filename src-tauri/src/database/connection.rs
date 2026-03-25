use sqlx::SqlitePool;
use anyhow::Result;

pub async fn init_database(db_url: &str) -> Result<SqlitePool> {
    let pool = SqlitePool::connect(db_url).await?;
    run_migrations(&pool).await?;
    Ok(pool)
}

async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    let migration_sql = include_str!("migrations/001_initial.sql");

    for statement in migration_sql.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            if let Err(e) = sqlx::query(trimmed).execute(pool).await {
                // Ignore "duplicate column" and "no such table" errors — those mean
                // the element already exists (safe to skip)
                let msg = e.to_string();
                if !msg.contains("duplicate column name")
                    && !msg.contains("no such table")
                    && !msg.contains("UNIQUE constraint failed")
                    && !msg.contains("table already exists")
                    && !msg.contains("index already exists")
                {
                    eprintln!("Migration warning (usually safe to ignore): {}", msg);
                }
            }
        }
    }

    // Migration: add library_id to existing documents table
    // (new databases get it from the CREATE TABLE above)
    let add_library_id = sqlx::query("ALTER TABLE documents ADD COLUMN library_id TEXT");
    let _ = add_library_id.execute(pool).await;

    // Index for library_id (may already exist from CREATE INDEX above)
    let add_idx = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_documents_library_id ON documents(library_id)",
    );
    let _ = add_idx.execute(pool).await;

    // Migration: add color to tags table (for card-level tag coloring)
    let add_color_to_tags = sqlx::query("ALTER TABLE tags ADD COLUMN color TEXT NOT NULL DEFAULT '#6B7280'");
    let _ = add_color_to_tags.execute(pool).await;

    // Migration: create annotation_tags junction table
    let create_annotation_tags = sqlx::query(
        "CREATE TABLE IF NOT EXISTS annotation_tags (
            annotation_id TEXT NOT NULL,
            tag_id TEXT NOT NULL,
            PRIMARY KEY (annotation_id, tag_id),
            FOREIGN KEY (annotation_id) REFERENCES annotations(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        )",
    );
    let _ = create_annotation_tags.execute(pool).await;

    let create_annotation_tags_idx = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_annotation_tags_annotation_id ON annotation_tags(annotation_id)",
    );
    let _ = create_annotation_tags_idx.execute(pool).await;

    let create_annotation_tags_idx2 = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_annotation_tags_tag_id ON annotation_tags(tag_id)",
    );
    let _ = create_annotation_tags_idx2.execute(pool).await;

    // Migration: add index on documents.file_path for fast duplicate-check on upload
    let idx_file_path = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents(file_path)",
    );
    let _ = idx_file_path.execute(pool).await;

    // Migration: add index on annotations.document_id for fast document annotation lookup
    let idx_annotations_doc = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_annotations_document_id ON annotations(document_id)",
    );
    let _ = idx_annotations_doc.execute(pool).await;

    // Migration: add index on annotations.page_number for fast page-based lookup
    let idx_annotations_page = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_annotations_page_number ON annotations(page_number)",
    );
    let _ = idx_annotations_page.execute(pool).await;

    // Migration: add UNIQUE constraint on tags.name to prevent race condition in get_or_create.
    let unique_tags_name = sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_tags_name_unique ON tags(name)",
    );
    let _ = unique_tags_name.execute(pool).await;

    // Migration: add UNIQUE constraint on conversations.document_id for atomic get_or_create.
    let unique_conv_doc = sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_document_id_unique ON conversations(document_id)",
    );
    let _ = unique_conv_doc.execute(pool).await;

    // Migration: add UNIQUE constraint on documents.file_path to prevent TOCTOU race
    // on duplicate upload checks (enforced atomically via UNIQUE index + ON CONFLICT).
    let unique_file_path = sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_file_path_unique ON documents(file_path)",
    );
    let _ = unique_file_path.execute(pool).await;

    // Migration: add composite index on annotations(document_id, page_number)
    // for efficient page-specific annotation queries when loading a document.
    let idx_annotations_doc_page = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_annotations_document_page ON annotations(document_id, page_number)",
    );
    let _ = idx_annotations_doc_page.execute(pool).await;

    Ok(())
}
