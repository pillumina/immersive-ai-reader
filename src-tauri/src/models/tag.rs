use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::Utc;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

/// Row returned by the batch annotation-tags query (annotation_id + tag columns).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct AnnotationTagRow {
    pub annotation_id: String,
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

impl Tag {
    pub fn new(name: String, color: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            color,
            created_at: Utc::now().to_rfc3339(),
        }
    }
}

impl From<AnnotationTagRow> for Tag {
    fn from(row: AnnotationTagRow) -> Self {
        Tag {
            id: row.id,
            name: row.name,
            color: row.color,
            created_at: row.created_at,
        }
    }
}
