use sqlx::SqlitePool;
use crate::models::annotation::Annotation;
use anyhow::Result;

pub struct AnnotationRepository {
    pool: SqlitePool,
}

impl AnnotationRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn save(&self, annotation: &Annotation) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO annotations (id, document_id, page_number, type, color, position_x, position_y, position_width, position_height, text, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&annotation.id)
        .bind(&annotation.document_id)
        .bind(annotation.page_number)
        .bind(&annotation.annotation_type)
        .bind(&annotation.color)
        .bind(annotation.position_x)
        .bind(annotation.position_y)
        .bind(annotation.position_width)
        .bind(annotation.position_height)
        .bind(&annotation.text)
        .bind(&annotation.created_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_by_document(&self, document_id: &str) -> Result<Vec<Annotation>> {
        let annotations = sqlx::query_as(
            r#"SELECT id, document_id, page_number, type as annotation_type, color, position_x, position_y, position_width, position_height, text, created_at FROM annotations WHERE document_id = ?"#,
        )
        .bind(document_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(annotations)
    }

    pub async fn delete(&self, id: &str) -> Result<()> {
        sqlx::query(r#"DELETE FROM annotations WHERE id = ?"#)
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(())
    }

    pub async fn update_position(
        &self,
        id: &str,
        position_x: f64,
        position_y: f64,
    ) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE annotations
            SET position_x = ?, position_y = ?
            WHERE id = ?
            "#,
        )
        .bind(position_x)
        .bind(position_y)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_text(
        &self,
        id: &str,
        text: &str,
    ) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE annotations
            SET text = ?
            WHERE id = ?
            "#,
        )
        .bind(text)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}
