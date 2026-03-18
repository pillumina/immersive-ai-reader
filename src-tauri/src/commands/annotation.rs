use tauri::State;
use crate::database::repositories::annotation_repo::AnnotationRepository;
use crate::models::annotation::{Annotation, CreateAnnotationRequest};
use anyhow::Result;

#[tauri::command]
pub async fn create_annotation(
    request: CreateAnnotationRequest,
    repo: State<'_, AnnotationRepository>,
) -> Result<Annotation, String> {
    let annotation = Annotation::from_request(request);
    repo.save(&annotation).await.map_err(|e| e.to_string())?;
    Ok(annotation)
}

#[tauri::command]
pub async fn get_annotations_by_document(
    document_id: String,
    repo: State<'_, AnnotationRepository>,
) -> Result<Vec<Annotation>, String> {
    repo.get_by_document(&document_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_annotation(
    id: String,
    repo: State<'_, AnnotationRepository>,
) -> Result<(), String> {
    repo.delete(&id).await.map_err(|e| e.to_string())
}
