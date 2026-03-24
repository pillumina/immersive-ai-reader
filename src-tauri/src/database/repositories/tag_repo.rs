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

    /// Get or create a tag by name with a specific color
    pub async fn get_or_create(&self, name: &str, color: &str) -> Result<Tag> {
        // Try to find existing tag
        let existing = sqlx::query_as::<_, Tag>(
            r#"SELECT id, name, color, created_at FROM tags WHERE name = ?"#,
        )
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;

        if let Some(tag) = existing {
            // Update color if provided and different
            if color != tag.color.as_str() {
                sqlx::query(r#"UPDATE tags SET color = ? WHERE id = ?"#)
                    .bind(color)
                    .bind(&tag.id)
                    .execute(&self.pool)
                    .await?;
                let mut updated = tag;
                updated.color = color.to_string();
                return Ok(updated);
            }
            return Ok(tag);
        }

        // Create new tag
        let tag = Tag::new(name.to_string(), color.to_string());
        sqlx::query(r#"INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)"#)
            .bind(&tag.id)
            .bind(&tag.name)
            .bind(&tag.color)
            .bind(&tag.created_at)
            .execute(&self.pool)
            .await?;
        Ok(tag)
    }

    /// Search tags by name prefix (for autocomplete)
    pub async fn search(&self, prefix: &str) -> Result<Vec<Tag>> {
        let pattern = format!("{}%", prefix.to_lowercase());
        let tags = sqlx::query_as::<_, Tag>(
            r#"SELECT id, name, color, created_at FROM tags WHERE LOWER(name) LIKE ? ORDER BY name ASC LIMIT 20"#,
        )
        .bind(&pattern)
        .fetch_all(&self.pool)
        .await?;
        Ok(tags)
    }

    /// Get all tags (for autocomplete)
    pub async fn get_all(&self) -> Result<Vec<Tag>> {
        let tags = sqlx::query_as::<_, Tag>(
            r#"SELECT id, name, color, created_at FROM tags ORDER BY name ASC"#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(tags)
    }

    /// Get tags for a specific document
    pub async fn get_by_document(&self, document_id: &str) -> Result<Vec<Tag>> {
        let tags = sqlx::query_as::<_, Tag>(
            r#"
            SELECT DISTINCT t.id, t.name, t.color, t.created_at
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
    pub async fn add_to_document(&self, document_id: &str, tag_name: &str, color: &str) -> Result<()> {
        let tag = self.get_or_create(tag_name, color).await?;
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

    /// Get tags for a specific annotation (card)
    pub async fn get_by_annotation(&self, annotation_id: &str) -> Result<Vec<Tag>> {
        let tags = sqlx::query_as::<_, Tag>(
            r#"
            SELECT t.id, t.name, t.color, t.created_at
            FROM tags t
            JOIN annotation_tags at ON at.tag_id = t.id
            WHERE at.annotation_id = ?
            ORDER BY t.name ASC
            "#,
        )
        .bind(annotation_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(tags)
    }

    /// Set tags for an annotation (replaces all existing tags)
    pub async fn set_annotation_tags(&self, annotation_id: &str, tag_names: Vec<String>, colors: Vec<String>) -> Result<()> {
        // Remove all existing tags for this annotation
        sqlx::query(r#"DELETE FROM annotation_tags WHERE annotation_id = ?"#)
            .bind(annotation_id)
            .execute(&self.pool)
            .await?;

        // Add new tags
        for (i, name) in tag_names.iter().enumerate() {
            let color = colors.get(i).map(|c| c.as_str()).unwrap_or("#6B7280");
            let tag = self.get_or_create(name, color).await?;
            sqlx::query(r#"INSERT OR IGNORE INTO annotation_tags (annotation_id, tag_id) VALUES (?, ?)"#)
                .bind(annotation_id)
                .bind(&tag.id)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    /// Add a single tag to an annotation
    pub async fn add_to_annotation(&self, annotation_id: &str, tag_name: &str, color: &str) -> Result<()> {
        let tag = self.get_or_create(tag_name, color).await?;
        sqlx::query(r#"INSERT OR IGNORE INTO annotation_tags (annotation_id, tag_id) VALUES (?, ?)"#)
            .bind(annotation_id)
            .bind(&tag.id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    /// Remove a single tag from an annotation
    pub async fn remove_from_annotation(&self, annotation_id: &str, tag_name: &str) -> Result<()> {
        sqlx::query(
            r#"
            DELETE FROM annotation_tags
            WHERE annotation_id = ? AND tag_id = (
                SELECT id FROM tags WHERE name = ?
            )
            "#,
        )
        .bind(annotation_id)
        .bind(tag_name)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Delete a tag (removes from all documents and annotations)
    pub async fn delete(&self, id: &str) -> Result<()> {
        sqlx::query(r#"DELETE FROM tags WHERE id = ?"#)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
