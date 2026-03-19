use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Clone)]
pub struct AIClient {
    http_client: reqwest::Client,
}

impl AIClient {
    fn resolve_chat_endpoint(provider: &str, endpoint: &str) -> Result<String, anyhow::Error> {
        let trimmed = endpoint.trim();
        if trimmed.is_empty() {
            return Err(anyhow::anyhow!("Endpoint is empty"));
        }

        if trimmed.contains("docs.bigmodel.cn") {
            return Err(anyhow::anyhow!(
                "You provided a documentation URL, not an API endpoint. Use https://open.bigmodel.cn/api/paas/v4/chat/completions"
            ));
        }

        if provider == "zhipu" {
            // Accept either full chat path or v4 base endpoint and normalize.
            if trimmed.ends_with("/api/paas/v4") || trimmed.ends_with("/api/paas/v4/") {
                return Ok("https://open.bigmodel.cn/api/paas/v4/chat/completions".to_string());
            }
            if trimmed == "https://open.bigmodel.cn/api/paas/v4/" || trimmed == "https://open.bigmodel.cn/api/paas/v4" {
                return Ok("https://open.bigmodel.cn/api/paas/v4/chat/completions".to_string());
            }
        }

        if provider == "zhipu_coding" {
            // Accept either full chat path or v4 base endpoint and normalize.
            if trimmed.ends_with("/api/coding/paas/v4") || trimmed.ends_with("/api/coding/paas/v4/") {
                return Ok("https://open.bigmodel.cn/api/coding/paas/v4/chat/completions".to_string());
            }
            if trimmed == "https://open.bigmodel.cn/api/coding/paas/v4/" || trimmed == "https://open.bigmodel.cn/api/coding/paas/v4" {
                return Ok("https://open.bigmodel.cn/api/coding/paas/v4/chat/completions".to_string());
            }
        }

        if provider == "minimax" {
            // Handle minimax anthropic endpoint - accept base or full path
            if trimmed.ends_with("/anthropic") && !trimmed.ends_with("/chat/completions") {
                return Ok(format!("{}chat/completions", trimmed));
            }
        }

        Ok(trimmed.to_string())
    }

    pub fn new() -> Self {
        Self {
            http_client: reqwest::Client::new(),
        }
    }

    fn extract_business_error(body: &str) -> Option<String> {
        let parsed: Value = serde_json::from_str(body).ok()?;

        // Common provider patterns:
        // - {"code":500,"msg":"404 NOT_FOUND","success":false}
        // - {"error":{"message":"..."}}
        // - {"error":"..."}
        if let Some(success) = parsed.get("success").and_then(|v| v.as_bool()) {
            if !success {
                let msg = parsed
                    .get("msg")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Business error");
                let code = parsed.get("code").and_then(|v| v.as_i64()).unwrap_or(-1);
                return Some(format!("Business error code {}: {}", code, msg));
            }
        }

        if let Some(code) = parsed.get("code").and_then(|v| v.as_i64()) {
            if code != 0 {
                let msg = parsed
                    .get("msg")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Business error");
                return Some(format!("Business error code {}: {}", code, msg));
            }
        }

        if let Some(err) = parsed.get("error") {
            if let Some(msg) = err.get("message").and_then(|v| v.as_str()) {
                return Some(msg.to_string());
            }
            if let Some(msg) = err.as_str() {
                return Some(msg.to_string());
            }
        }

        None
    }

    pub async fn call_chat(
        &self,
        provider: &str,
        endpoint: &str,
        model: &str,
        api_key: &str,
        messages: Vec<ChatMessage>,
    ) -> Result<String, anyhow::Error> {
        let endpoint = Self::resolve_chat_endpoint(provider, endpoint)?;
        let mut request = self.http_client
            .post(&endpoint)
            .json(&serde_json::json!({
                "model": model,
                "messages": messages,
                "stream": false,
            }));

        // Default to Bearer auth for OpenAI-compatible endpoints.
        request = request.header("Authorization", format!("Bearer {}", api_key));
        if provider == "anthropic" {
            request = request
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01");
        }

        let response = request.send().await?;
        let status = response.status();
        let status_code = status.as_u16();
        let body = response.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(anyhow::anyhow!(
                "HTTP {} from model endpoint: {}",
                status_code,
                body.chars().take(320).collect::<String>()
            ));
        }

        if let Some(business_error) = Self::extract_business_error(&body) {
            return Err(anyhow::anyhow!(business_error));
        }

        Ok(body)
    }

    pub async fn call_chat_stream(
        &self,
        provider: &str,
        endpoint: &str,
        model: &str,
        api_key: &str,
        messages: Vec<ChatMessage>,
    ) -> Result<reqwest::Response, anyhow::Error> {
        let endpoint = Self::resolve_chat_endpoint(provider, endpoint)?;
        let mut request = self.http_client
            .post(&endpoint)
            .json(&serde_json::json!({
                "model": model,
                "messages": messages,
                "stream": true,
            }));

        request = request.header("Authorization", format!("Bearer {}", api_key));
        if provider == "anthropic" {
            request = request
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01");
        }

        let response = request.send().await?;
        let status = response.status();
        if !status.is_success() {
            let status_code = status.as_u16();
            let body = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!(
                "HTTP {} from model endpoint: {}",
                status_code,
                body.chars().take(320).collect::<String>()
            ));
        }
        Ok(response)
    }

    pub async fn test_connectivity(
        &self,
        provider: &str,
        endpoint: &str,
        model: &str,
        api_key: &str,
    ) -> Result<(bool, u16, u128, String), anyhow::Error> {
        let endpoint = Self::resolve_chat_endpoint(provider, endpoint)?;
        let started = Instant::now();
        let mut request = self.http_client
            .post(&endpoint)
            .json(&serde_json::json!({
                "model": model,
                "messages": [
                    {
                        "role": "user",
                        "content": "ping"
                    }
                ],
                "stream": false,
                "max_tokens": 8
            }));

        request = request.header("Authorization", format!("Bearer {}", api_key));
        if provider == "anthropic" {
            request = request
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01");
        }

        let response = request.send().await?;
        let status = response.status();
        let status_code = status.as_u16();
        let latency_ms = started.elapsed().as_millis();
        let body = response.text().await.unwrap_or_default();

        let business_error = Self::extract_business_error(&body);
        let ok = status.is_success() && business_error.is_none();
        let message = if ok {
            "Connection successful".to_string()
        } else if let Some(err) = business_error {
            err
        } else if status_code == 401 || status_code == 403 {
            "Endpoint reachable but token is invalid or unauthorized".to_string()
        } else if status_code == 404 {
            "Endpoint reachable but path not found (check endpoint URL)".to_string()
        } else if !body.is_empty() {
            body.chars().take(240).collect()
        } else {
            format!("Request failed with status {}", status_code)
        };

        Ok((ok, status_code, latency_ms, message))
    }
}
