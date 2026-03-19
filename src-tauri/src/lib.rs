mod commands;
mod database;
mod models;
mod ai;
mod security;

use tauri::Manager;
use database::connection::init_database;
use database::repositories::{document_repo::DocumentRepository, annotation_repo::AnnotationRepository, conversation_repo::ConversationRepository};
use ai::client::AIClient;
use commands::ai::StreamRegistry;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Get app data directory using Manager trait
            let app_dir = app.path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            std::fs::create_dir_all(&app_dir).expect("Failed to create app dir");

            let db_path = app_dir.join("reader.db");
            let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

            // Initialize database
            let pool = tauri::async_runtime::block_on(async {
                init_database(&db_url).await.expect("Failed to init database")
            });

            // Register repositories as state
            app.manage(DocumentRepository::new(pool.clone()));
            app.manage(AnnotationRepository::new(pool.clone()));
            app.manage(ConversationRepository::new(pool));
            app.manage(AIClient::new());
            app.manage(StreamRegistry::default());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Document commands
            commands::document::create_document,
            commands::document::get_document,
            commands::document::get_all_documents,
            commands::document::delete_document,
            commands::document::open_pdf_file,
            commands::document::read_pdf_file,
            commands::document::update_document_file_path,

            // Annotation commands
            commands::annotation::create_annotation,
            commands::annotation::get_annotations_by_document,
            commands::annotation::delete_annotation,
            commands::annotation::update_annotation_position,

            // Conversation commands
            commands::conversation::get_conversation,
            commands::conversation::add_message,
            commands::conversation::get_messages,

            // AI commands
            commands::ai::send_chat_message,
            commands::ai::start_stream_chat,
            commands::ai::stop_stream_chat,
            commands::ai::save_api_key,
            commands::ai::get_api_key,
            commands::ai::delete_api_key,
            commands::ai::test_ai_connectivity,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
