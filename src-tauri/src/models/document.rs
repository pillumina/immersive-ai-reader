use serde::{Deserialize, Serialize};
use chrono::Utc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Document {
    pub id: String,
    pub file_name: String,
    pub file_path: String,
    pub file_size: i64,
    pub page_count: i32,
    pub text_content: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateDocumentRequest {
    pub file_name: String,
    pub file_path: String,
    pub file_size: i64,
    pub page_count: i32,
    pub text_content: String,
}

impl Document {
    pub fn from_request(req: CreateDocumentRequest) -> Self {
        let now = Utc::now().to_rfc3339();
        Self {
            id: Uuid::new_v4().to_string(),
            file_name: req.file_name,
            file_path: req.file_path,
            file_size: req.file_size,
            page_count: req.page_count,
            text_content: Some(req.text_content),
            created_at: now.clone(),
            updated_at: now,
        }
    }
}
