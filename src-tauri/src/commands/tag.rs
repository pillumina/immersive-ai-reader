use tauri::State;
use crate::database::repositories::tag_repo::TagRepository;
use crate::models::tag::Tag;

#[tauri::command]
pub async fn get_all_tags(
    repo: State<'_, TagRepository>,
) -> Result<Vec<Tag>, String> {
    repo.get_all().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_tags(
    prefix: String,
    repo: State<'_, TagRepository>,
) -> Result<Vec<Tag>, String> {
    repo.search(&prefix).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_document_tags(
    document_id: String,
    repo: State<'_, TagRepository>,
) -> Result<Vec<Tag>, String> {
    repo.get_by_document(&document_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_tag_to_document(
    document_id: String,
    tag_name: String,
    color: Option<String>,
    repo: State<'_, TagRepository>,
) -> Result<(), String> {
    repo.add_to_document(&document_id, &tag_name, color.as_deref().unwrap_or("#6B7280"))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_tag_from_document(
    document_id: String,
    tag_name: String,
    repo: State<'_, TagRepository>,
) -> Result<(), String> {
    repo.remove_from_document(&document_id, &tag_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_tag(
    id: String,
    repo: State<'_, TagRepository>,
) -> Result<(), String> {
    repo.delete(&id).await.map_err(|e| e.to_string())
}

// Annotation-level tag commands

#[tauri::command]
pub async fn get_annotation_tags(
    annotation_id: String,
    repo: State<'_, TagRepository>,
) -> Result<Vec<Tag>, String> {
    repo.get_by_annotation(&annotation_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_annotation_tags(
    annotation_id: String,
    tag_names: Vec<String>,
    colors: Vec<String>,
    repo: State<'_, TagRepository>,
) -> Result<(), String> {
    repo.set_annotation_tags(&annotation_id, tag_names, colors)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_tag_to_annotation(
    annotation_id: String,
    tag_name: String,
    color: Option<String>,
    repo: State<'_, TagRepository>,
) -> Result<(), String> {
    repo.add_to_annotation(&annotation_id, &tag_name, color.as_deref().unwrap_or("#6B7280"))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_tag_from_annotation(
    annotation_id: String,
    tag_name: String,
    repo: State<'_, TagRepository>,
) -> Result<(), String> {
    repo.remove_from_annotation(&annotation_id, &tag_name)
        .await
        .map_err(|e| e.to_string())
}
