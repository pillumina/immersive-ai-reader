use sqlx::SqlitePool;
use crate::models::conversation::{Conversation, Message};
use anyhow::Result;
use uuid::Uuid;
use chrono::Utc;

pub struct ConversationRepository {
    pool: SqlitePool,
}

impl ConversationRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    /// Get or create a conversation for a document.
    /// Uses atomic INSERT OR IGNORE + fetch to avoid TOCTOU race conditions.
    pub async fn get_or_create(&self, document_id: &str) -> Result<Conversation> {
        // Try to insert atomically; ON CONFLICT is a no-op since document_id is UNIQUE.
        let now = Utc::now().to_rfc3339();
        let conv = Conversation {
            id: Uuid::new_v4().to_string(),
            document_id: document_id.to_string(),
            created_at: now.clone(),
            updated_at: now,
        };

        sqlx::query(
            r#"INSERT OR IGNORE INTO conversations (id, document_id, created_at, updated_at) VALUES (?, ?, ?, ?)"#,
        )
        .bind(&conv.id)
        .bind(&conv.document_id)
        .bind(&conv.created_at)
        .bind(&conv.updated_at)
        .execute(&self.pool)
        .await?;

        // Fetch the conversation (either newly inserted or pre-existing).
        let found = sqlx::query_as(
            r#"SELECT id, document_id, created_at, updated_at FROM conversations WHERE document_id = ?"#,
        )
        .bind(document_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(found)
    }

    pub async fn add_message(&self, message: &Message) -> Result<i64> {
        let result: sqlx::sqlite::SqliteQueryResult = sqlx::query(
            r#"
            INSERT INTO messages (conversation_id, role, content, timestamp)
            VALUES (?, ?, ?, ?)
            "#,
        )
        .bind(&message.conversation_id)
        .bind(&message.role)
        .bind(&message.content)
        .bind(&message.timestamp)
        .execute(&self.pool)
        .await?;

        // Update conversation updated_at
        let now = Utc::now().to_rfc3339();
        sqlx::query(r#"UPDATE conversations SET updated_at = ? WHERE id = ?"#)
            .bind(&now)
            .bind(&message.conversation_id)
            .execute(&self.pool)
            .await?;

        Ok(result.last_insert_rowid())
    }

    pub async fn get_messages(&self, conversation_id: &str) -> Result<Vec<Message>> {
        let messages = sqlx::query_as(
            r#"SELECT id, conversation_id, role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC"#,
        )
        .bind(conversation_id)
        .fetch_all(&self.pool)
        .await?;

        Ok(messages)
    }
}
