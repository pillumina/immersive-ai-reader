use tauri::State;
use crate::ai::client::{AIClient, ChatMessage};
use crate::security::keychain;
use anyhow::Result;
use serde::{Deserialize, Serialize};

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
