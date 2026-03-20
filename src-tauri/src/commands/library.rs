use tauri::State;
use crate::database::repositories::library_repo::LibraryRepository;
use crate::models::library::{Library, CreateLibraryRequest};

#[tauri::command]
pub async fn create_library(
    request: CreateLibraryRequest,
    repo: State<'_, LibraryRepository>,
) -> Result<Library, String> {
    let lib = Library::new(request.name, request.color);
    repo.save(&lib).await.map_err(|e| e.to_string())?;
    Ok(lib)
}

#[tauri::command]
pub async fn get_library(
    id: String,
    repo: State<'_, LibraryRepository>,
) -> Result<Option<Library>, String> {
    repo.get_by_id(&id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_libraries(
    repo: State<'_, LibraryRepository>,
) -> Result<Vec<Library>, String> {
    repo.get_all().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_library(
    id: String,
    name: String,
    color: String,
    repo: State<'_, LibraryRepository>,
) -> Result<(), String> {
    repo.update(&id, &name, &color).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_library(
    id: String,
    repo: State<'_, LibraryRepository>,
) -> Result<(), String> {
    repo.delete(&id).await.map_err(|e| e.to_string())
}
