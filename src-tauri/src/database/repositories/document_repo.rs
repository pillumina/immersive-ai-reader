use sqlx::SqlitePool;
use crate::models::document::Document;
use anyhow::Result;

pub struct DocumentRepository {
    pool: SqlitePool,
}

impl DocumentRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn save(&self, doc: &Document) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO documents (id, file_name, file_path, file_size, page_count, text_content, library_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                file_name = excluded.file_name,
                file_path = excluded.file_path,
                file_size = excluded.file_size,
                page_count = excluded.page_count,
                text_content = excluded.text_content,
                library_id = excluded.library_id,
                updated_at = excluded.updated_at
            "#,
        )
        .bind(&doc.id)
        .bind(&doc.file_name)
        .bind(&doc.file_path)
        .bind(doc.file_size)
        .bind(doc.page_count)
        .bind(&doc.text_content)
        .bind(&doc.library_id)
        .bind(&doc.created_at)
        .bind(&doc.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_by_id(&self, id: &str) -> Result<Option<Document>> {
        let doc = sqlx::query_as(
            r#"SELECT id, file_name, file_path, file_size, page_count, text_content, library_id, created_at, updated_at FROM documents WHERE id = ?"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(doc)
    }

    pub async fn get_all(&self) -> Result<Vec<Document>> {
        let docs = sqlx::query_as(
            r#"SELECT id, file_name, file_path, file_size, page_count, text_content, library_id, created_at, updated_at FROM documents ORDER BY created_at DESC"#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(docs)
    }

    pub async fn get_by_library(&self, library_id: &str) -> Result<Vec<Document>> {
        let docs = sqlx::query_as(
            r#"SELECT id, file_name, file_path, file_size, page_count, text_content, library_id, created_at, updated_at FROM documents WHERE library_id = ? ORDER BY updated_at DESC"#,
        )
        .bind(library_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(docs)
    }

    pub async fn delete(&self, id: &str) -> Result<()> {
        sqlx::query(r#"DELETE FROM documents WHERE id = ?"#)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_file_path(&self, id: &str, file_path: &str, file_name: &str, file_size: i64) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE documents
            SET file_path = ?, file_name = ?, file_size = ?, updated_at = datetime('now')
            WHERE id = ?
            "#,
        )
        .bind(file_path)
        .bind(file_name)
        .bind(file_size)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_library(&self, id: &str, library_id: Option<&str>) -> Result<()> {
        sqlx::query(
            r#"UPDATE documents SET library_id = ?, updated_at = datetime('now') WHERE id = ?"#,
        )
        .bind(library_id)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
