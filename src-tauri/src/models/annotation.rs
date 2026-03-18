use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct Annotation {
    pub id: String,
    pub document_id: String,
    pub page_number: i32,
    #[serde(rename = "type")]
    pub annotation_type: String,
    pub color: String,
    pub position_x: f64,
    pub position_y: f64,
    pub position_width: f64,
    pub position_height: f64,
    pub text: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAnnotationRequest {
    pub document_id: String,
    pub page_number: i32,
    pub annotation_type: String,
    pub color: String,
    pub position_x: f64,
    pub position_y: f64,
    pub position_width: f64,
    pub position_height: f64,
    pub text: Option<String>,
}

impl Annotation {
    pub fn from_request(req: CreateAnnotationRequest) -> Self {
        use uuid::Uuid;
        use chrono::Utc;

        Self {
            id: Uuid::new_v4().to_string(),
            document_id: req.document_id,
            page_number: req.page_number,
            annotation_type: req.annotation_type,
            color: req.color,
            position_x: req.position_x,
            position_y: req.position_y,
            position_width: req.position_width,
            position_height: req.position_height,
            text: req.text,
            created_at: Utc::now().to_rfc3339(),
        }
    }
}
