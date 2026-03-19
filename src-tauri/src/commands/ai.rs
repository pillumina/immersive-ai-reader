use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Instant;
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter, Manager, State};
use crate::ai::client::{AIClient, ChatMessage};
use crate::security::keychain;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;
use uuid::Uuid;

const MAX_RETRIES: u32 = 3;
const INITIAL_BACKOFF_MS: u64 = 1000;
const MAX_BACKOFF_MS: u64 = 8000;
const BACKOFF_MULTIPLIER: u64 = 2;

#[derive(Serialize)]
pub struct ConnectivityCheckResult {
    pub ok: bool,
    pub status_code: u16,
    pub latency_ms: u128,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct HistoryMessage {
    pub role: String,
    pub content: String,
}

#[derive(Default)]
pub struct StreamRegistry {
    flags: RwLock<HashMap<String, Arc<AtomicBool>>>,
}

impl StreamRegistry {
    pub async fn create(&self, stream_id: &str) -> Arc<AtomicBool> {
        let cancel_flag = Arc::new(AtomicBool::new(false));
        let mut map = self.flags.write().await;
        map.insert(stream_id.to_string(), cancel_flag.clone());
        cancel_flag
    }

    pub async fn cancel(&self, stream_id: &str) {
        let map = self.flags.read().await;
        if let Some(flag) = map.get(stream_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub async fn remove(&self, stream_id: &str) {
        let mut map = self.flags.write().await;
        map.remove(stream_id);
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamChunkEvent {
    pub stream_id: String,
    pub delta: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamDoneEvent {
    pub stream_id: String,
    pub content: String,
    pub latency_ms: u128,
    pub prompt_tokens: Option<u32>,
    pub completion_tokens: Option<u32>,
    pub total_tokens: Option<u32>,
    pub stopped: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamErrorEvent {
    pub stream_id: String,
    pub message: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct StreamRetryEvent {
    pub stream_id: String,
    pub attempt: u32,
    pub max_attempts: u32,
    pub delay_ms: u64,
    pub error: String,
}

#[derive(Debug, Serialize)]
pub struct StartStreamResult {
    pub stream_id: String,
}

#[tauri::command]
pub async fn send_chat_message(
    provider: String,
    endpoint: String,
    model: String,
    api_key: String,
    _document_id: String,
    message: String,
    history: Vec<HistoryMessage>,
    ai_client: State<'_, AIClient>,
) -> Result<String, String> {
    if endpoint.trim().is_empty() {
        return Err("Endpoint is required".to_string());
    }
    if model.trim().is_empty() {
        return Err("Model is required".to_string());
    }

    // Backward compatibility: if frontend didn't pass key, fallback to keychain.
    let resolved_api_key = if api_key.trim().is_empty() {
        keychain::get_api_key(&provider)
            .map_err(|e| format!("Failed to get API key: {}", e))?
    } else {
        api_key
    };

    // Convert history to ChatMessage format
    let messages: Vec<ChatMessage> = history
        .into_iter()
        .map(|m| ChatMessage { role: m.role, content: m.content })
        .chain(std::iter::once(ChatMessage {
            role: "user".to_string(),
            content: message,
        }))
        .collect();

    // Call AI API
    let response = ai_client
        .call_chat(&provider, &endpoint, &model, &resolved_api_key, messages)
        .await;

    response.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn start_stream_chat(
    provider: String,
    endpoint: String,
    model: String,
    api_key: String,
    _document_id: String,
    message: String,
    history: Vec<HistoryMessage>,
    stream_registry: State<'_, StreamRegistry>,
    app: AppHandle,
) -> Result<StartStreamResult, String> {
    if endpoint.trim().is_empty() {
        return Err("Endpoint is required".to_string());
    }
    if model.trim().is_empty() {
        return Err("Model is required".to_string());
    }

    let resolved_api_key = if api_key.trim().is_empty() {
        keychain::get_api_key(&provider)
            .map_err(|e| format!("Failed to get API key: {}", e))?
    } else {
        api_key
    };

    let messages: Vec<ChatMessage> = history
        .into_iter()
        .map(|m| ChatMessage { role: m.role, content: m.content })
        .chain(std::iter::once(ChatMessage {
            role: "user".to_string(),
            content: message,
        }))
        .collect();

    let stream_id = Uuid::new_v4().to_string();
    let cancel_flag = stream_registry.create(&stream_id).await;
    let app_handle = app.clone();
    let provider_clone = provider.clone();
    let endpoint_clone = endpoint.clone();
    let model_clone = model.clone();
    let api_key_clone = resolved_api_key.clone();
    let stream_id_clone = stream_id.clone();

    tauri::async_runtime::spawn(async move {
        let client = app_handle.state::<AIClient>();
        // Note: stream_chat_and_emit handles all error emission internally
        // It returns Ok(()) in all cases, emitting appropriate events
        let _ = stream_chat_and_emit(
            &app_handle,
            client.inner(),
            &stream_id_clone,
            &provider_clone,
            &endpoint_clone,
            &model_clone,
            &api_key_clone,
            messages,
            cancel_flag,
        )
        .await;

        let registry = app_handle.state::<StreamRegistry>();
        registry.remove(&stream_id_clone).await;
    });

    Ok(StartStreamResult { stream_id })
}

#[tauri::command]
pub async fn stop_stream_chat(
    stream_id: String,
    stream_registry: State<'_, StreamRegistry>,
) -> Result<(), String> {
    stream_registry.cancel(&stream_id).await;
    Ok(())
}

fn calculate_backoff_delay(attempt: u32) -> u64 {
    let exponential_delay = INITIAL_BACKOFF_MS * BACKOFF_MULTIPLIER.pow(attempt - 1);
    let capped_delay = exponential_delay.min(MAX_BACKOFF_MS);
    // Add jitter (±25%) to prevent thundering herd
    let jitter = (capped_delay as f64 * 0.25 * (rand_simple() * 2.0 - 1.0)) as u64;
    (capped_delay + jitter).max(100) // Minimum 100ms delay
}

/// Simple pseudo-random for jitter (avoids external deps)
fn rand_simple() -> f64 {
    use std::time::Instant;
    static mut LAST: u64 = 0;
    let now = Instant::now().elapsed().as_nanos() as u64;
    unsafe {
        LAST = LAST.wrapping_mul(1103515245).wrapping_add(12345);
        ((now ^ LAST) & 0x7fffffff) as f64 / 0x7fffffff as f64
    }
}

fn is_retryable_error(err: &str) -> bool {
    let err_lower = err.to_lowercase();
    // Network errors
    err_lower.contains("connection")
        || err_lower.contains("timeout")
        || err_lower.contains("aborted")
        || err_lower.contains("network")
        || err_lower.contains("recv error")
        || err_lower.contains("error sending")
        // HTTP status codes
        || err_lower.contains("429")
        || err_lower.contains("500")
        || err_lower.contains("502")
        || err_lower.contains("503")
        || err_lower.contains("504")
}

fn emit_retry_event(app: &AppHandle, stream_id: &str, attempt: u32, delay_ms: u64, error: &str) {
    let _ = app.emit(
        "ai_stream_retry",
        StreamRetryEvent {
            stream_id: stream_id.to_string(),
            attempt,
            max_attempts: MAX_RETRIES,
            delay_ms,
            error: error.to_string(),
        },
    );
}

fn emit_error_event(app: &AppHandle, stream_id: &str, message: &str) {
    let _ = app.emit(
        "ai_stream_error",
        StreamErrorEvent {
            stream_id: stream_id.to_string(),
            message: message.to_string(),
        },
    );
}

fn emit_done_event(
    app: &AppHandle,
    stream_id: &str,
    content: String,
    latency_ms: u128,
    prompt_tokens: Option<u32>,
    completion_tokens: Option<u32>,
    total_tokens: Option<u32>,
    stopped: bool,
) {
    let _ = app.emit(
        "ai_stream_done",
        StreamDoneEvent {
            stream_id: stream_id.to_string(),
            content,
            latency_ms,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            stopped,
        },
    );
}

fn emit_chunk_event(app: &AppHandle, stream_id: &str, delta: String) {
    let _ = app.emit(
        "ai_stream_chunk",
        StreamChunkEvent {
            stream_id: stream_id.to_string(),
            delta,
        },
    );
}

async fn stream_chat_and_emit(
    app: &AppHandle,
    ai_client: &AIClient,
    stream_id: &str,
    provider: &str,
    endpoint: &str,
    model: &str,
    api_key: &str,
    messages: Vec<ChatMessage>,
    cancel_flag: Arc<AtomicBool>,
) -> Result<()> {
    let started = Instant::now();
    let mut full_content = String::new();
    let mut prompt_tokens: Option<u32> = None;
    let mut completion_tokens: Option<u32> = None;
    let mut total_tokens: Option<u32> = None;
    let mut last_error = String::new();

    // Retry loop with exponential backoff
    for attempt in 1..=MAX_RETRIES {
        // Check cancellation before each attempt
        if cancel_flag.load(Ordering::Relaxed) {
            emit_done_event(
                app, stream_id, full_content.clone(), started.elapsed().as_millis(),
                prompt_tokens, completion_tokens, total_tokens, true,
            );
            return Ok(());
        }

        let result = ai_client
            .call_chat_stream(provider, endpoint, model, api_key, messages.clone())
            .await;

        match result {
            Ok(response) => {
                let mut stream = response.bytes_stream();
                let mut raw_buffer = String::new();
                let mut stream_err: Option<String> = None;

                while let Some(next_chunk) = stream.next().await {
                    // Check cancellation during streaming
                    if cancel_flag.load(Ordering::Relaxed) {
                        emit_done_event(
                            app, stream_id, full_content.clone(), started.elapsed().as_millis(),
                            prompt_tokens, completion_tokens, total_tokens, true,
                        );
                        return Ok(());
                    }

                    let bytes = match next_chunk {
                        Ok(b) => b,
                        Err(e) => {
                            // Stream interrupted - will trigger retry
                            stream_err = Some(format!("Stream interrupted: {}", e));
                            break;
                        }
                    };
                    let text = String::from_utf8_lossy(&bytes);
                    raw_buffer.push_str(&text);

                    while let Some(line_end) = raw_buffer.find('\n') {
                        let line = raw_buffer[..line_end].trim().to_string();
                        raw_buffer = raw_buffer[line_end + 1..].to_string();

                        if line.is_empty() || !line.starts_with("data:") {
                            continue;
                        }

                        let payload = line.trim_start_matches("data:").trim();
                        if payload == "[DONE]" {
                            emit_done_event(
                                app, stream_id, full_content.clone(), started.elapsed().as_millis(),
                                prompt_tokens, completion_tokens, total_tokens, false,
                            );
                            return Ok(());
                        }

                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) {
                            if let Some(delta) = json
                                .get("choices")
                                .and_then(|c| c.get(0))
                                .and_then(|c| c.get("delta"))
                                .and_then(|d| d.get("content"))
                                .and_then(|v| v.as_str())
                            {
                                if !delta.is_empty() {
                                    full_content.push_str(delta);
                                    emit_chunk_event(app, stream_id, delta.to_string());
                                }
                            }

                            if let Some(usage) = json.get("usage") {
                                prompt_tokens = usage.get("prompt_tokens").and_then(|v| v.as_u64()).map(|v| v as u32);
                                completion_tokens = usage.get("completion_tokens").and_then(|v| v.as_u64()).map(|v| v as u32);
                                total_tokens = usage.get("total_tokens").and_then(|v| v.as_u64()).map(|v| v as u32);
                            }
                        }
                    }
                }

                // If stream had an error, treat as retryable
                if let Some(err) = stream_err {
                    last_error = err;
                    if !is_retryable_error(&last_error) || attempt == MAX_RETRIES {
                        emit_error_event(app, stream_id, &last_error);
                        emit_done_event(
                            app, stream_id, full_content.clone(), started.elapsed().as_millis(),
                            prompt_tokens, completion_tokens, total_tokens, false,
                        );
                        return Ok(());
                    }
                    let delay_ms = calculate_backoff_delay(attempt);
                    emit_retry_event(app, stream_id, attempt, delay_ms, &last_error);
                    tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
                    if cancel_flag.load(Ordering::Relaxed) {
                        emit_done_event(
                            app, stream_id, full_content.clone(), started.elapsed().as_millis(),
                            prompt_tokens, completion_tokens, total_tokens, true,
                        );
                        return Ok(());
                    }
                    continue;
                }

                // If we exited the loop but still have content, stream ended normally
                if full_content.is_empty() && !raw_buffer.trim().is_empty() {
                    full_content = raw_buffer.trim().to_string();
                    emit_chunk_event(app, stream_id, full_content.clone());
                }

                // Success - emit done even if stream ended without [DONE]
                emit_done_event(
                    app, stream_id, full_content.clone(), started.elapsed().as_millis(),
                    prompt_tokens, completion_tokens, total_tokens,
                    cancel_flag.load(Ordering::Relaxed),
                );
                return Ok(());
            }
            Err(e) => {
                last_error = e.to_string();

                // Check if error is retryable
                if !is_retryable_error(&last_error) || attempt == MAX_RETRIES {
                    // Non-retryable error or all retries exhausted
                    emit_error_event(app, stream_id, &last_error);
                    emit_done_event(
                        app, stream_id, full_content.clone(), started.elapsed().as_millis(),
                        prompt_tokens, completion_tokens, total_tokens, false,
                    );
                    return Ok(()); // Return Ok to avoid double-error emission in caller
                }

                // Calculate backoff delay
                let delay_ms = calculate_backoff_delay(attempt);
                emit_retry_event(app, stream_id, attempt, delay_ms, &last_error);

                // Wait with backoff
                let delay_fut = tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms));
                tokio::pin!(delay_fut);

                tokio::select! {
                    _ = delay_fut => {
                        // Continue to next retry
                    }
                    _ = tokio::time::sleep(tokio::time::Duration::from_secs(60)) => {
                        // Safety timeout
                        emit_error_event(app, stream_id, "Retry timeout exceeded");
                        return Ok(());
                    }
                }

                if cancel_flag.load(Ordering::Relaxed) {
                    emit_done_event(
                        app, stream_id, full_content.clone(), started.elapsed().as_millis(),
                        prompt_tokens, completion_tokens, total_tokens, true,
                    );
                    return Ok(());
                }
            }
        }
    }

    // Should not reach here, but handle gracefully
    if last_error.is_empty() {
        last_error = "Unknown error after retries".to_string();
    }
    emit_error_event(app, stream_id, &last_error);
    emit_done_event(
        app, stream_id, full_content.clone(), started.elapsed().as_millis(),
        prompt_tokens, completion_tokens, total_tokens, false,
    );
    Ok(())
}

#[tauri::command]
pub fn save_api_key(provider: String, api_key: String) -> Result<(), String> {
    keychain::save_api_key(&provider, &api_key)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_api_key(provider: String) -> Result<String, String> {
    keychain::get_api_key(&provider)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    keychain::delete_api_key(&provider)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_ai_connectivity(
    provider: String,
    endpoint: String,
    model: String,
    api_key: String,
    ai_client: State<'_, AIClient>,
) -> Result<ConnectivityCheckResult, String> {
    if endpoint.trim().is_empty() {
        return Err("Endpoint is required".to_string());
    }
    if model.trim().is_empty() {
        return Err("Model is required".to_string());
    }
    if api_key.trim().is_empty() {
        return Err("Token / API key is required".to_string());
    }

    let (ok, status_code, latency_ms, message) = ai_client
        .test_connectivity(&provider, &endpoint, &model, &api_key)
        .await
        .map_err(|e| {
            format!(
                "Connectivity test failed: provider='{}', endpoint='{}', model='{}', error='{}'",
                provider, endpoint, model, e
            )
        })?;

    Ok(ConnectivityCheckResult {
        ok,
        status_code,
        latency_ms,
        message,
    })
}
