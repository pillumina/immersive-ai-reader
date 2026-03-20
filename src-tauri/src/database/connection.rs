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

    Ok(())
}
