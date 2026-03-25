use sqlx::SqlitePool;
use crate::models::document::{Document, DocumentSummary};
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
            INSERT INTO documents (id, file_name, file_path, file_size, page_count, text_content, library_id, last_page, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                file_name = excluded.file_name,
                file_path = excluded.file_path,
                file_size = excluded.file_size,
                page_count = excluded.page_count,
                text_content = excluded.text_content,
                library_id = excluded.library_id,
                last_page = excluded.last_page,
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
        .bind(doc.last_page)
        .bind(&doc.created_at)
        .bind(&doc.updated_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_by_id(&self, id: &str) -> Result<Option<Document>> {
        let doc = sqlx::query_as(
            r#"SELECT id, file_name, file_path, file_size, page_count, text_content, library_id, last_page, created_at, updated_at FROM documents WHERE id = ?"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(doc)
    }

    pub async fn get_all(&self) -> Result<Vec<Document>> {
        let docs = sqlx::query_as(
            r#"SELECT id, file_name, file_path, file_size, page_count, text_content, library_id, last_page, created_at, updated_at FROM documents ORDER BY created_at DESC"#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(docs)
    }

    /// Lightweight list of all documents (excludes text_content for bandwidth efficiency).
    pub async fn get_all_summaries(&self) -> Result<Vec<DocumentSummary>> {
        let docs = sqlx::query_as::<_, DocumentSummary>(
            r#"SELECT id, file_name, file_path, file_size, page_count, library_id, last_page, created_at, updated_at FROM documents ORDER BY created_at DESC"#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(docs)
    }

    pub async fn get_by_library(&self, library_id: &str) -> Result<Vec<Document>> {
        let docs = sqlx::query_as(
            r#"SELECT id, file_name, file_path, file_size, page_count, text_content, library_id, last_page, created_at, updated_at FROM documents WHERE library_id = ? ORDER BY updated_at DESC"#,
        )
        .bind(library_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(docs)
    }

    /// Lightweight list of documents in a library (excludes text_content).
    pub async fn get_summaries_by_library(&self, library_id: &str) -> Result<Vec<DocumentSummary>> {
        let docs = sqlx::query_as::<_, DocumentSummary>(
            r#"SELECT id, file_name, file_path, file_size, page_count, library_id, last_page, created_at, updated_at FROM documents WHERE library_id = ? ORDER BY updated_at DESC"#,
        )
        .bind(library_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(docs)
    }

    pub async fn find_by_file_path(&self, file_path: &str) -> Result<Option<Document>> {
        let doc = sqlx::query_as(
            r#"SELECT id, file_name, file_path, file_size, page_count, text_content, library_id, last_page, created_at, updated_at FROM documents WHERE file_path = ?"#,
        )
        .bind(file_path)
        .fetch_optional(&self.pool)
        .await?;
        Ok(doc)
    }

    pub async fn upsert_by_file_path(&self, doc: &Document) -> Result<Document> {
        // Atomic upsert using ON CONFLICT(file_path): preserves id/conversations
        // on re-upload while updating metadata. Falls back to plain save for new docs.
        sqlx::query(
            r#"
            INSERT INTO documents (id, file_name, file_path, file_size, page_count, text_content, library_id, last_page, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(file_path) DO UPDATE SET
                file_name = excluded.file_name,
                file_size = excluded.file_size,
                page_count = excluded.page_count,
                text_content = excluded.text_content,
                library_id = excluded.library_id,
                last_page = excluded.last_page,
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
        .bind(doc.last_page)
        .bind(&doc.created_at)
        .bind(&doc.updated_at)
        .execute(&self.pool)
        .await?;

        // Re-fetch to return canonical document with preserved fields
        self.get_by_id(&doc.id).await?.ok_or_else(|| anyhow::anyhow!("Document not found after upsert"))
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

    pub async fn update_last_page(&self, id: &str, last_page: i32) -> Result<()> {
        sqlx::query(
            r#"UPDATE documents SET last_page = ?, updated_at = datetime('now') WHERE id = ?"#,
        )
        .bind(last_page)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}
