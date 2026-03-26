use tauri::State;
use crate::database::repositories::ai_usage_repo::AiUsageRepository;
use crate::models::ai_usage::{AiUsageStats, RecordAiUsageRequest};

#[tauri::command]
pub async fn record_ai_usage(
    repo: State<'_, AiUsageRepository>,
    req: RecordAiUsageRequest,
) -> Result<(), String> {
    repo.record(req).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn get_ai_usage_stats(
    repo: State<'_, AiUsageRepository>,
    days: i32,
) -> Result<AiUsageStats, String> {
    repo.get_stats(days).await.map_err(|e| e.to_string())
}
