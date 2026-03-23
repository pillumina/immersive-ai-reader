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
    // Check if a document with this file_path already exists — if so, reuse its id
    // so that conversations and notes remain associated with the same document.
    if let Some(existing) = repo.find_by_file_path(&request.file_path).await.map_err(|e| e.to_string())? {
        // Update metadata but preserve the existing id and created_at (conversations/notes use id)
        let updated = Document {
            id: existing.id,
            file_name: request.file_name,
            file_path: request.file_path,
            file_size: request.file_size,
            page_count: request.page_count,
            text_content: Some(request.text_content),
            library_id: existing.library_id, // preserve library assignment
            last_page: existing.last_page,   // preserve reading progress
            created_at: existing.created_at,
            updated_at: chrono::Utc::now().to_rfc3339(),
        };
        repo.upsert(&updated).await.map_err(|e| e.to_string())?;
        Ok(updated)
    } else {
        let doc = Document::from_request(request);
        repo.save(&doc).await.map_err(|e| e.to_string())?;
        Ok(doc)
    }
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

#[tauri::command]
pub async fn update_document_last_page(
    id: String,
    last_page: i32,
    repo: State<'_, DocumentRepository>,
) -> Result<(), String> {
    repo.update_last_page(&id, last_page)
        .await
        .map_err(|e| e.to_string())
}
