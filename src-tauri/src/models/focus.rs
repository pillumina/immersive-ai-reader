use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct FocusSession {
    pub id: String,
    pub document_id: String,
    pub session_id: String,
    pub entered_at: String,
    pub exited_at: Option<String>,
    pub duration_minutes: Option<i32>,
    pub last_page: i32,
    pub max_scroll_top: f64,
    pub max_read_percentage: f64,
    pub ai_panel_collapsed: bool,
    pub ai_conversation_id: Option<String>,
    pub highlights_count: i32,
    pub notes_count: i32,
    pub ai_responses_count: i32,
    pub summary_triggered: bool,
    pub summary_action: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateFocusSessionRequest {
    pub document_id: String,
    pub session_id: String,
    pub entered_at: String,
    pub last_page: i32,
}

#[derive(Debug, Deserialize)]
pub struct FocusSessionUpdate {
    pub exited_at: Option<String>,
    pub duration_minutes: Option<i32>,
    pub last_page: Option<i32>,
    pub max_scroll_top: Option<f64>,
    pub max_read_percentage: Option<f64>,
    pub ai_panel_collapsed: Option<bool>,
    pub ai_conversation_id: Option<String>,
    pub highlights_count: Option<i32>,
    pub notes_count: Option<i32>,
    pub ai_responses_count: Option<i32>,
    pub summary_triggered: Option<bool>,
    pub summary_action: Option<String>,
}

impl FocusSession {
    pub fn from_request(req: CreateFocusSessionRequest) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            document_id: req.document_id,
            session_id: req.session_id,
            entered_at: req.entered_at,
            exited_at: None,
            duration_minutes: None,
            last_page: req.last_page,
            max_scroll_top: 0.0,
            max_read_percentage: 0.0,
            ai_panel_collapsed: true,
            ai_conversation_id: None,
            highlights_count: 0,
            notes_count: 0,
            ai_responses_count: 0,
            summary_triggered: false,
            summary_action: None,
        }
    }
}
