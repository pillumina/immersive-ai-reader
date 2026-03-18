use sqlx::SqlitePool;
use anyhow::Result;

pub async fn init_database(db_url: &str) -> Result<SqlitePool> {
    // Connect to database
    let pool = SqlitePool::connect(db_url).await?;

    // Run migrations
    run_migrations(&pool).await?;

    Ok(pool)
}

async fn run_migrations(pool: &SqlitePool) -> Result<()> {
    // Read and execute migration SQL
    let migration_sql = include_str!("migrations/001_initial.sql");

    // Split by semicolons and execute each statement
    for statement in migration_sql.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() {
            sqlx::query(trimmed)
                .execute(pool)
                .await?;
        }
    }

    Ok(())
}
