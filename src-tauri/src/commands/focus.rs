use tauri::State;
use crate::database::repositories::focus_repo::FocusRepository;
use crate::models::focus::{CreateFocusSessionRequest, FocusSession, FocusSessionUpdate};

#[tauri::command]
pub async fn create_focus_session(
    repo: State<'_, FocusRepository>,
    req: CreateFocusSessionRequest,
) -> Result<FocusSession, String> {
    let session = FocusSession::from_request(req);
    repo.create(&session)
        .await
        .map_err(|e| e.to_string())?;
    Ok(session)
}

#[tauri::command]
pub async fn update_focus_session(
    repo: State<'_, FocusRepository>,
    session_id: String,
    updates: FocusSessionUpdate,
) -> Result<(), String> {
    repo.update(&session_id, updates)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_last_focus_session(
    repo: State<'_, FocusRepository>,
    document_id: String,
) -> Result<Option<FocusSession>, String> {
    repo.get_last_for_document(&document_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_focus_session_history(
    repo: State<'_, FocusRepository>,
    document_id: String,
    limit: i32,
) -> Result<Vec<FocusSession>, String> {
    repo.get_history(&document_id, limit)
        .await
        .map_err(|e| e.to_string())
}
