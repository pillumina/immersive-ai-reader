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

    /// Get or create a tag by name with a specific color.
    /// Uses atomic INSERT OR IGNORE + fetch to avoid TOCTOU race conditions.
    pub async fn get_or_create(&self, name: &str, color: &str) -> Result<Tag> {
        // Try to insert atomically; ON CONFLICT is a no-op since name is UNIQUE.
        let tag = Tag::new(name.to_string(), color.to_string());
        sqlx::query(
            r#"INSERT OR IGNORE INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)"#,
        )
        .bind(&tag.id)
        .bind(name)
        .bind(&tag.color)
        .bind(&tag.created_at)
        .execute(&self.pool)
        .await?;

        // Fetch the tag (either newly inserted or pre-existing).
        let found = sqlx::query_as::<_, Tag>(
            r#"SELECT id, name, color, created_at FROM tags WHERE name = ?"#,
        )
        .bind(name)
        .fetch_one(&self.pool)
        .await?;

        // Update color if it differs from what was requested.
        if color != found.color.as_str() {
            sqlx::query(r#"UPDATE tags SET color = ? WHERE id = ?"#)
                .bind(color)
                .bind(&found.id)
                .execute(&self.pool)
                .await?;
            let mut updated = found;
            updated.color = color.to_string();
            return Ok(updated);
        }

        Ok(found)
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

    /// Batch get tags for multiple annotations in a single query.
    /// Returns a map of annotation_id -> Vec<Tag>.
    pub async fn get_by_annotations(&self, annotation_ids: &[String]) -> Result<std::collections::HashMap<String, Vec<Tag>>> {
        if annotation_ids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }
        let placeholders: Vec<&str> = annotation_ids.iter().map(|_| "?").collect();
        let query = format!(
            r#"
            SELECT at.annotation_id, t.id, t.name, t.color, t.created_at
            FROM tags t
            JOIN annotation_tags at ON at.tag_id = t.id
            WHERE at.annotation_id IN ({})
            ORDER BY at.annotation_id, t.name ASC
            "#,
            placeholders.join(",")
        );
        let mut q = sqlx::query_as::<_, crate::models::tag::AnnotationTagRow>(&query);
        for id in annotation_ids {
            q = q.bind(id);
        }
        let rows: Vec<crate::models::tag::AnnotationTagRow> = q.fetch_all(&self.pool).await?;

        let mut map: std::collections::HashMap<String, Vec<Tag>> =
            std::collections::HashMap::new();
        for row in rows {
            let annotation_id = row.annotation_id.clone();
            let tag = Tag::from(row);
            map.entry(annotation_id).or_default().push(tag);
        }
        Ok(map)
    }

    /// Set tags for an annotation (replaces all existing tags).
    /// Optimized: 5 queries total instead of 3N (one per tag).
    pub async fn set_annotation_tags(&self, annotation_id: &str, tag_names: Vec<String>, colors: Vec<String>) -> Result<()> {
        if tag_names.is_empty() {
            sqlx::query(r#"DELETE FROM annotation_tags WHERE annotation_id = ?"#)
                .bind(annotation_id)
                .execute(&self.pool)
                .await?;
            return Ok(());
        }

        // 1. Remove all existing tags for this annotation
        sqlx::query(r#"DELETE FROM annotation_tags WHERE annotation_id = ?"#)
            .bind(annotation_id)
            .execute(&self.pool)
            .await?;

        // 2. Fetch existing tags by name (batch, not per-tag)
        let existing_tags: Vec<Tag> = {
            let placeholders: Vec<&str> = tag_names.iter().map(|_| "?").collect();
            let query = format!(
                r#"SELECT id, name, color, created_at FROM tags WHERE name IN ({})"#,
                placeholders.join(",")
            );
            let mut q = sqlx::query_as::<_, Tag>(&query);
            for name in &tag_names { q = q.bind(name); }
            q.fetch_all(&self.pool).await?
        };
        let mut tag_map: std::collections::HashMap<String, Tag> =
            existing_tags.into_iter().map(|t| (t.name.clone(), t)).collect();

        // 3. Batch-insert all missing tags in a single query.
        let missing_tags: Vec<(String, Tag)> = tag_names.iter()
            .enumerate()
            .filter(|(_i, name)| !tag_map.contains_key(*name))
            .map(|(i, name)| {
                let color = colors.get(i).map(|c| c.as_str()).unwrap_or("#6B7280");
                let tag = Tag::new(name.clone(), color.to_string());
                (name.clone(), tag)
            })
            .collect();
        if !missing_tags.is_empty() {
            let mut batch_q = sqlx::query(r#"INSERT OR IGNORE INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)"#);
            for (name, tag) in &missing_tags {
                batch_q = batch_q.bind(&tag.id).bind(name).bind(&tag.color).bind(&tag.created_at);
                tag_map.insert(name.clone(), tag.clone());
            }
            batch_q.execute(&self.pool).await?;
        }

        // 4. Fetch all tags (including newly inserted) for junction insert
        let all_tags: Vec<Tag> = {
            let placeholders: Vec<&str> = tag_names.iter().map(|_| "?").collect();
            let query = format!(
                r#"SELECT id, name, color, created_at FROM tags WHERE name IN ({})"#,
                placeholders.join(",")
            );
            let mut q = sqlx::query_as::<_, Tag>(&query);
            for name in &tag_names { q = q.bind(name); }
            q.fetch_all(&self.pool).await?
        };

        // 5. Batch insert junction rows
        let mut junction_q = sqlx::query(r#"INSERT OR IGNORE INTO annotation_tags (annotation_id, tag_id) VALUES (?, ?)"#);
        for tag in &all_tags {
            junction_q = junction_q.bind(annotation_id).bind(&tag.id);
        }
        junction_q.execute(&self.pool).await?;

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

    /// Remove a single tag from an annotation (uses JOIN instead of subquery)
    pub async fn remove_from_annotation(&self, annotation_id: &str, tag_name: &str) -> Result<()> {
        sqlx::query(
            r#"
            DELETE FROM annotation_tags
            WHERE annotation_id = ? AND tag_id IN (SELECT id FROM tags WHERE name = ?)
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
