mod commands;
mod database;
mod models;
mod ai;
mod security;

use tauri::Manager;
use database::connection::init_database;
use database::repositories::{document_repo::DocumentRepository, annotation_repo::AnnotationRepository, conversation_repo::ConversationRepository, library_repo::LibraryRepository, tag_repo::TagRepository, focus_repo::FocusRepository};
use ai::client::AIClient;
use commands::ai::StreamRegistry;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_dir = app.path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            std::fs::create_dir_all(&app_dir).expect("Failed to create app dir");

            let db_path = app_dir.join("reader.db");
            let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

            let pool = tauri::async_runtime::block_on(async {
                init_database(&db_url).await.expect("Failed to init database")
            });

            app.manage(DocumentRepository::new(pool.clone()));
            app.manage(AnnotationRepository::new(pool.clone()));
            app.manage(ConversationRepository::new(pool.clone()));
            app.manage(LibraryRepository::new(pool.clone()));
            app.manage(TagRepository::new(pool.clone()));
            app.manage(FocusRepository::new(pool.clone()));
            app.manage(AIClient::new());
            app.manage(StreamRegistry::default());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Document commands
            commands::document::create_document,
            commands::document::get_document,
            commands::document::get_all_documents,
            commands::document::get_documents_by_library,
            commands::document::delete_document,
            commands::document::open_pdf_file,
            commands::document::read_pdf_file,
            commands::document::update_document_file_path,
            commands::document::update_document_library,
            commands::document::update_document_last_page,

            // Annotation commands
            commands::annotation::create_annotation,
            commands::annotation::get_annotations_by_document,
            commands::annotation::delete_annotation,
            commands::annotation::update_annotation_position,
            commands::annotation::update_annotation_text,

            // Conversation commands
            commands::conversation::get_conversation,
            commands::conversation::get_conversation_with_preview,
            commands::conversation::add_message,
            commands::conversation::get_messages,

            // Library commands
            commands::library::create_library,
            commands::library::get_library,
            commands::library::get_all_libraries,
            commands::library::update_library,
            commands::library::delete_library,

            // Tag commands
            commands::tag::get_all_tags,
            commands::tag::search_tags,
            commands::tag::get_document_tags,
            commands::tag::add_tag_to_document,
            commands::tag::remove_tag_from_document,
            commands::tag::delete_tag,
            commands::tag::get_annotation_tags,
            commands::tag::get_annotation_tags_batch,
            commands::tag::set_annotation_tags,
            commands::tag::add_tag_to_annotation,
            commands::tag::remove_tag_from_annotation,

            // AI commands
            commands::ai::send_chat_message,
            commands::ai::start_stream_chat,
            commands::ai::stop_stream_chat,
            commands::ai::save_api_key,
            commands::ai::get_api_key,
            commands::ai::delete_api_key,
            commands::ai::test_ai_connectivity,

            // Focus Mode commands
            commands::focus::create_focus_session,
            commands::focus::update_focus_session,
            commands::focus::get_last_focus_session,
            commands::focus::get_focus_session_history,
            commands::focus::get_all_focus_sessions,
            commands::focus::delete_focus_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
