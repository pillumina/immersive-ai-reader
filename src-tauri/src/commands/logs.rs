use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};
use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct LogFile {
    pub name: String,
    pub path: String,
    pub size_bytes: u64,
    pub lines: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct ReadLogsResult {
    pub files: Vec<LogFile>,
    pub total_size_bytes: u64,
}

/// Read recent log entries from the app's log files.
/// Returns the last `max_lines` lines from the most recent log file(s).
#[tauri::command]
pub async fn read_app_logs(
    app: AppHandle,
    max_lines: Option<usize>,
) -> Result<ReadLogsResult, String> {
    let app_dir = app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let log_dir = app_dir.join("logs");

    if !log_dir.exists() {
        return Ok(ReadLogsResult {
            files: vec![],
            total_size_bytes: 0,
        });
    }

    let max_lines = max_lines.unwrap_or(500);

    // Find all .log files, sorted by name (most recent last)
    let mut log_files: Vec<_> = fs::read_dir(&log_dir)
        .map_err(|e| format!("Failed to read log dir: {}", e))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry.path().extension().map(|e| e == "log").unwrap_or(false)
        })
        .collect();

    log_files.sort_by_key(|e| e.file_name());

    let mut result_files = Vec::new();
    let mut total_size = 0u64;

    // Read from the most recent log file(s) until we have enough lines
    let mut lines_collected: Vec<String> = Vec::with_capacity(max_lines);

    for entry in log_files.iter().rev() {
        let path = entry.path();
        let metadata = fs::metadata(&path).map_err(|e| format!("Failed to read log file metadata: {}", e))?;
        let size = metadata.len();
        total_size += size;

        let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read log file: {}", e))?;
        let file_lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

        // Prepend file lines to our collection (newest file first)
        let mut all_lines = file_lines;
        all_lines.extend(lines_collected.drain(..));
        lines_collected = all_lines;

        if lines_collected.len() >= max_lines {
            break;
        }
    }

    // Trim to max_lines
    if lines_collected.len() > max_lines {
        lines_collected = lines_collected[lines_collected.len() - max_lines..].to_vec();
    }

    // Use the most recent log file for the display
    if let Some(newest) = log_files.last() {
        let path = newest.path();
        let metadata = fs::metadata(&path).map_err(|e| format!("Failed to read log file metadata: {}", e))?;

        result_files.push(LogFile {
            name: newest.file_name().to_string_lossy().to_string(),
            path: path.to_string_lossy().to_string(),
            size_bytes: metadata.len(),
            lines: lines_collected,
        });
    }

    Ok(ReadLogsResult {
        files: result_files,
        total_size_bytes: total_size,
    })
}
