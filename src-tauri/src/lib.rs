mod commands;
mod database;
mod models;
mod ai;
mod security;

use std::path::PathBuf;
use tauri::Manager;
use database::connection::init_database;
use database::repositories::{document_repo::DocumentRepository, annotation_repo::AnnotationRepository, conversation_repo::ConversationRepository, library_repo::LibraryRepository, tag_repo::TagRepository, focus_repo::FocusRepository, ai_usage_repo::AiUsageRepository};
use ai::client::AIClient;
use commands::ai::StreamRegistry;

/// Guards the tracing worker thread so it stays alive for the entire app lifecycle.
/// Dropping this will terminate the async logging worker and lose buffered log entries.
struct LogGuard(tracing_appender::non_blocking::WorkerGuard);

static LOG_GUARD: std::sync::OnceLock<LogGuard> = std::sync::OnceLock::new();

fn init_tracing(log_dir: &PathBuf) {
    use tracing_subscriber::{fmt, prelude::*, EnvFilter};

    std::fs::create_dir_all(log_dir).ok();

    // Only initialize once per process
    let _ = LOG_GUARD.get_or_init(|| {
        let (non_blocking, guard) = tracing_appender::non_blocking(
            tracing_appender::rolling::Builder::new()
                .max_log_files(3)
                .filename_prefix("app")
                .filename_suffix("log")
                .build(log_dir)
                .expect("Failed to create log directory"),
        );

        let filter = EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| EnvFilter::new("info"));

        tracing_subscriber::registry()
            .with(filter)
            // File output (no ANSI codes — plain text log files)
            .with(fmt::layer().with_writer(non_blocking).with_ansi(false))
            // Stdout (visible in Tauri DevTools console)
            .with(fmt::layer().with_writer(std::io::stdout))
            .try_init()
            .ok(); // OK if already initialized (e.g. by a plugin)

        LogGuard(guard)
    });
}

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

            let log_dir = app_dir.join("logs");
            init_tracing(&log_dir);

            tracing::info!("App starting up, log dir: {:?}", log_dir);

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
            app.manage(AiUsageRepository::new(pool.clone()));
            app.manage(AIClient::new());
            app.manage(StreamRegistry::default());

            tracing::info!("Database initialized, all repositories managed");

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

            // AI usage commands
            commands::ai_usage::record_ai_usage,
            commands::ai_usage::get_ai_usage_stats,

            // Log commands
            commands::logs::read_app_logs,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
