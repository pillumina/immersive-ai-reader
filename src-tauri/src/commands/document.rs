use tauri::State;
use std::fs;
use std::path::PathBuf;
use crate::database::repositories::document_repo::DocumentRepository;
use crate::models::document::{Document, CreateDocumentRequest};
use anyhow::Result;

#[tauri::command]
pub async fn create_document(
    request: CreateDocumentRequest,
    repo: State<'_, DocumentRepository>,
) -> Result<Document, String> {
    let doc = Document::from_request(request);
    repo.save(&doc).await.map_err(|e| e.to_string())?;
    Ok(doc)
}

#[tauri::command]
pub async fn get_document(
    id: String,
    repo: State<'_, DocumentRepository>,
) -> Result<Option<Document>, String> {
    repo.get_by_id(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_documents(
    repo: State<'_, DocumentRepository>,
) -> Result<Vec<Document>, String> {
    repo.get_all().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_document(
    id: String,
    repo: State<'_, DocumentRepository>,
) -> Result<(), String> {
    repo.delete(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_pdf_file(app: tauri::AppHandle) -> Result<Option<(PathBuf, Vec<u8>)>, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app.dialog()
        .file()
        .add_filter("PDF", &["pdf"])
        .blocking_pick_file();

    match file_path {
        Some(path) => {
            let path = path.into_path().map_err(|e| format!("Failed to get file path: {}", e))?;
            let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
            Ok(Some((path, bytes)))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn read_pdf_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Failed to read file '{}': {}", path, e))
}

#[tauri::command]
pub async fn update_document_file_path(
    id: String,
    file_path: String,
    file_name: String,
    file_size: i64,
    repo: State<'_, DocumentRepository>,
) -> Result<(), String> {
    repo.update_file_path(&id, &file_path, &file_name, file_size)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_documents_by_library(
    library_id: String,
    repo: State<'_, DocumentRepository>,
) -> Result<Vec<Document>, String> {
    repo.get_by_library(&library_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_document_library(
    id: String,
    library_id: Option<String>,
    repo: State<'_, DocumentRepository>,
) -> Result<(), String> {
    repo.update_library(&id, library_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}
