use sqlx::SqlitePool;
use anyhow::Result;
use crate::models::focus::{FocusSession, FocusSessionUpdate};

pub struct FocusRepository {
    pool: SqlitePool,
}

impl FocusRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, session: &FocusSession) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO focus_sessions (
                id, document_id, session_id, entered_at, exited_at, duration_minutes,
                last_page, max_scroll_top, max_read_percentage,
                ai_panel_collapsed, ai_conversation_id,
                highlights_count, notes_count, ai_responses_count,
                summary_triggered, summary_action
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&session.id)
        .bind(&session.document_id)
        .bind(&session.session_id)
        .bind(&session.entered_at)
        .bind(&session.exited_at)
        .bind(&session.duration_minutes)
        .bind(&session.last_page)
        .bind(&session.max_scroll_top)
        .bind(&session.max_read_percentage)
        .bind(session.ai_panel_collapsed)
        .bind(&session.ai_conversation_id)
        .bind(&session.highlights_count)
        .bind(&session.notes_count)
        .bind(&session.ai_responses_count)
        .bind(session.summary_triggered)
        .bind(&session.summary_action)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update(&self, session_id: &str, updates: FocusSessionUpdate) -> Result<()> {
        // Update exited_at
        if let Some(v) = updates.exited_at {
            sqlx::query("UPDATE focus_sessions SET exited_at = ? WHERE session_id = ?")
                .bind(&v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update duration_minutes
        if let Some(v) = updates.duration_minutes {
            sqlx::query("UPDATE focus_sessions SET duration_minutes = ? WHERE session_id = ?")
                .bind(v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update last_page
        if let Some(v) = updates.last_page {
            sqlx::query("UPDATE focus_sessions SET last_page = ? WHERE session_id = ?")
                .bind(v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update max_scroll_top
        if let Some(v) = updates.max_scroll_top {
            sqlx::query("UPDATE focus_sessions SET max_scroll_top = ? WHERE session_id = ?")
                .bind(v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update max_read_percentage
        if let Some(v) = updates.max_read_percentage {
            sqlx::query("UPDATE focus_sessions SET max_read_percentage = ? WHERE session_id = ?")
                .bind(v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update ai_panel_collapsed
        if let Some(v) = updates.ai_panel_collapsed {
            sqlx::query("UPDATE focus_sessions SET ai_panel_collapsed = ? WHERE session_id = ?")
                .bind(v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update ai_conversation_id
        if let Some(v) = updates.ai_conversation_id {
            sqlx::query("UPDATE focus_sessions SET ai_conversation_id = ? WHERE session_id = ?")
                .bind(&v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update highlights_count
        if let Some(v) = updates.highlights_count {
            sqlx::query("UPDATE focus_sessions SET highlights_count = ? WHERE session_id = ?")
                .bind(v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update notes_count
        if let Some(v) = updates.notes_count {
            sqlx::query("UPDATE focus_sessions SET notes_count = ? WHERE session_id = ?")
                .bind(v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update ai_responses_count
        if let Some(v) = updates.ai_responses_count {
            sqlx::query("UPDATE focus_sessions SET ai_responses_count = ? WHERE session_id = ?")
                .bind(v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update summary_triggered
        if let Some(v) = updates.summary_triggered {
            sqlx::query("UPDATE focus_sessions SET summary_triggered = ? WHERE session_id = ?")
                .bind(v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        // Update summary_action
        if let Some(v) = updates.summary_action {
            sqlx::query("UPDATE focus_sessions SET summary_action = ? WHERE session_id = ?")
                .bind(&v)
                .bind(session_id)
                .execute(&self.pool)
                .await?;
        }
        Ok(())
    }

    pub async fn get_last_for_document(&self, document_id: &str) -> Result<Option<FocusSession>> {
        let row: Option<FocusSession> = sqlx::query_as(
            r#"
            SELECT * FROM focus_sessions
            WHERE document_id = ?
            ORDER BY entered_at DESC
            LIMIT 1
            "#,
        )
        .bind(document_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn get_history(&self, document_id: &str, limit: i32) -> Result<Vec<FocusSession>> {
        let rows: Vec<FocusSession> = sqlx::query_as(
            r#"
            SELECT * FROM focus_sessions
            WHERE document_id = ?
            ORDER BY entered_at DESC
            LIMIT ?
            "#,
        )
        .bind(document_id)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn get_all(&self, document_id: &str) -> Result<Vec<FocusSession>> {
        let rows: Vec<FocusSession> = sqlx::query_as(
            r#"
            SELECT * FROM focus_sessions
            WHERE document_id = ?
            ORDER BY entered_at DESC
            "#,
        )
        .bind(document_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn delete(&self, session_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM focus_sessions WHERE session_id = ?")
            .bind(session_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
