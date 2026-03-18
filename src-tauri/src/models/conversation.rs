use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Conversation {
    pub id: String,
    pub document_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Message {
    pub id: i64,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub timestamp: String,
}

#[derive(Debug, Deserialize)]
pub struct AddMessageRequest {
    pub conversation_id: String,
    pub role: String,
    pub content: String,
}

impl Message {
    pub fn from_request(req: AddMessageRequest) -> Self {
        use chrono::Utc;

        Self {
            id: 0, // Will be set by database
            conversation_id: req.conversation_id,
            role: req.role,
            content: req.content,
            timestamp: Utc::now().to_rfc3339(),
        }
    }
}
