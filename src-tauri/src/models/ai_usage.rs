use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AiUsage {
    pub id: String,
    pub document_id: Option<String>,
    pub conversation_id: Option<String>,
    pub model: String,
    pub provider: String,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub latency_ms: i32,
    pub cost_usd: Option<f64>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiUsageStats {
    pub total_requests: i32,
    pub total_prompt_tokens: i32,
    pub total_completion_tokens: i32,
    pub total_tokens: i32,
    pub total_cost_usd: f64,
    pub total_latency_ms: i64,
    pub avg_latency_ms: f64,
    pub avg_tokens_per_request: f64,
    pub by_model: Vec<ModelStats>,
    pub by_provider: Vec<ProviderStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ModelStats {
    pub model: String,
    pub requests: i32,
    pub total_tokens: i32,
    pub avg_latency_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProviderStats {
    pub provider: String,
    pub requests: i32,
    pub total_tokens: i32,
}

#[derive(Debug, Deserialize)]
pub struct RecordAiUsageRequest {
    pub document_id: Option<String>,
    pub conversation_id: Option<String>,
    pub model: String,
    pub provider: String,
    pub prompt_tokens: i32,
    pub completion_tokens: i32,
    pub total_tokens: i32,
    pub latency_ms: i32,
    pub cost_usd: Option<f64>,
}

impl AiUsage {
    pub fn from_request(req: RecordAiUsageRequest) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            document_id: req.document_id,
            conversation_id: req.conversation_id,
            model: req.model,
            provider: req.provider,
            prompt_tokens: req.prompt_tokens,
            completion_tokens: req.completion_tokens,
            total_tokens: req.total_tokens,
            latency_ms: req.latency_ms,
            cost_usd: req.cost_usd,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }
}
