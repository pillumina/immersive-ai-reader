use sqlx::SqlitePool;
use crate::models::library::Library;
use anyhow::Result;

pub struct LibraryRepository {
    pool: SqlitePool,
}

impl LibraryRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn save(&self, lib: &Library) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO libraries (id, name, color, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                color = excluded.color,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&lib.id)
        .bind(&lib.name)
        .bind(&lib.color)
        .bind(&lib.created_at)
        .bind(&lib.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_by_id(&self, id: &str) -> Result<Option<Library>> {
        let lib = sqlx::query_as::<_, Library>(
            r#"SELECT id, name, color, created_at, updated_at FROM libraries WHERE id = ?"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(lib)
    }

    pub async fn get_all(&self) -> Result<Vec<Library>> {
        let libs = sqlx::query_as::<_, Library>(
            r#"SELECT id, name, color, created_at, updated_at FROM libraries ORDER BY name ASC"#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(libs)
    }

    pub async fn delete(&self, id: &str) -> Result<()> {
        sqlx::query(r#"DELETE FROM libraries WHERE id = ?"#)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update(&self, id: &str, name: &str, color: &str) -> Result<()> {
        sqlx::query(
            r#"UPDATE libraries SET name = ?, color = ?, updated_at = datetime('now') WHERE id = ?"#,
        )
        .bind(name)
        .bind(color)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
