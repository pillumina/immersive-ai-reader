use sqlx::SqlitePool;
use crate::models::tag::Tag;
use anyhow::Result;

pub struct TagRepository {
    pool: SqlitePool,
}

impl TagRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Get or create a tag by name, returns the tag (existing or newly created)
    pub async fn get_or_create(&self, name: &str) -> Result<Tag> {
        // Try to find existing tag
        let existing = sqlx::query_as::<_, Tag>(
            r#"SELECT id, name, created_at FROM tags WHERE name = ?"#,
        )
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(tag) = existing {
            return Ok(tag);
        }

        // Create new tag
        let tag = Tag::new(name.to_string());
        sqlx::query(r#"INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)"#)
            .bind(&tag.id)
            .bind(&tag.name)
            .bind(&tag.created_at)
            .execute(&self.pool)
            .await?;
        Ok(tag)
    }

    /// Search tags by name prefix (for autocomplete)
    pub async fn search(&self, prefix: &str) -> Result<Vec<Tag>> {
        let pattern = format!("{}%", prefix.to_lowercase());
        let tags = sqlx::query_as::<_, Tag>(
            r#"SELECT id, name, created_at FROM tags WHERE LOWER(name) LIKE ? ORDER BY name ASC LIMIT 20"#,
        )
        .bind(&pattern)
        .fetch_all(&self.pool)
        .await?;
        Ok(tags)
    }

    /// Get all tags (for autocomplete)
    pub async fn get_all(&self) -> Result<Vec<Tag>> {
        let tags = sqlx::query_as::<_, Tag>(
            r#"SELECT id, name, created_at FROM tags ORDER BY name ASC"#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(tags)
    }

    /// Get tags for a specific document
    pub async fn get_by_document(&self, document_id: &str) -> Result<Vec<Tag>> {
        let tags = sqlx::query_as::<_, Tag>(
            r#"
            SELECT t.id, t.name, t.created_at
            FROM tags t
            JOIN document_tags dt ON dt.tag_id = t.id
            WHERE dt.document_id = ?
            ORDER BY t.name ASC
            "#,
        )
        .bind(document_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(tags)
    }

    /// Add a tag to a document
    pub async fn add_to_document(&self, document_id: &str, tag_name: &str) -> Result<()> {
        let tag = self.get_or_create(tag_name).await?;
        sqlx::query(
            r#"INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)"#,
        )
        .bind(document_id)
        .bind(&tag.id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Remove a tag from a document
    pub async fn remove_from_document(&self, document_id: &str, tag_name: &str) -> Result<()> {
        sqlx::query(
            r#"
            DELETE FROM document_tags
            WHERE document_id = ? AND tag_id = (
                SELECT id FROM tags WHERE name = ?
            )
            "#,
        )
        .bind(document_id)
        .bind(tag_name)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Delete a tag (removes from all documents)
    pub async fn delete(&self, id: &str) -> Result<()> {
        sqlx::query(r#"DELETE FROM tags WHERE id = ?"#)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
