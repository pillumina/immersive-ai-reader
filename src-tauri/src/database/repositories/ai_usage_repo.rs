use sqlx::SqlitePool;
use anyhow::Result;
use crate::models::ai_usage::{AiUsage, AiUsageStats, ModelStats, ProviderStats, RecordAiUsageRequest};

pub struct AiUsageRepository {
    pool: SqlitePool,
}

impl AiUsageRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn record(&self, req: RecordAiUsageRequest) -> Result<AiUsage> {
        let usage = AiUsage::from_request(req);
        sqlx::query(
            r#"
            INSERT INTO ai_usage (
                id, document_id, conversation_id, model, provider,
                prompt_tokens, completion_tokens, total_tokens, latency_ms, cost_usd, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&usage.id)
        .bind(&usage.document_id)
        .bind(&usage.conversation_id)
        .bind(&usage.model)
        .bind(&usage.provider)
        .bind(usage.prompt_tokens)
        .bind(usage.completion_tokens)
        .bind(usage.total_tokens)
        .bind(usage.latency_ms)
        .bind(usage.cost_usd)
        .bind(&usage.created_at)
        .execute(&self.pool)
        .await?;
        Ok(usage)
    }

    pub async fn get_stats(&self, days: i32) -> Result<AiUsageStats> {
        // Total aggregates
        #[derive(sqlx::FromRow)]
        struct TotalRow {
            total_requests: i32,
            total_prompt: i32,
            total_completion: i32,
            total_all: i32,
            total_cost: f64,
            total_latency: i64,
        }

        let cutoff = chrono::Utc::now() - chrono::Duration::days(days as i64);
        let cutoff_str = cutoff.to_rfc3339();

        let totals: Option<TotalRow> = sqlx::query_as(
            r#"
            SELECT
                COUNT(*) as total_requests,
                COALESCE(SUM(prompt_tokens), 0) as total_prompt,
                COALESCE(SUM(completion_tokens), 0) as total_completion,
                COALESCE(SUM(total_tokens), 0) as total_all,
                COALESCE(SUM(cost_usd), 0) as total_cost,
                COALESCE(SUM(latency_ms), 0) as total_latency
            FROM ai_usage
            WHERE created_at >= ?
            "#,
        )
        .bind(&cutoff_str)
        .fetch_optional(&self.pool)
        .await?;

        let (total_requests, total_prompt, total_completion, total_all, total_cost, total_latency) =
            match totals {
                Some(t) => (t.total_requests, t.total_prompt, t.total_completion, t.total_all, t.total_cost, t.total_latency),
                None => (0, 0, 0, 0, 0.0, 0),
            };

        let avg_latency_ms = if total_requests > 0 {
            total_latency as f64 / total_requests as f64
        } else {
            0.0
        };
        let avg_tokens_per_request = if total_requests > 0 {
            total_all as f64 / total_requests as f64
        } else {
            0.0
        };

        // By model
        let by_model: Vec<ModelStats> = sqlx::query_as(
            r#"
            SELECT
                model,
                COUNT(*) as requests,
                COALESCE(SUM(total_tokens), 0) as total_tokens,
                COALESCE(AVG(latency_ms), 0.0) as avg_latency_ms
            FROM ai_usage
            WHERE created_at >= ?
            GROUP BY model
            ORDER BY requests DESC
            "#,
        )
        .bind(&cutoff_str)
        .fetch_all(&self.pool)
        .await?;

        // By provider
        let by_provider: Vec<ProviderStats> = sqlx::query_as(
            r#"
            SELECT
                provider,
                COUNT(*) as requests,
                COALESCE(SUM(total_tokens), 0) as total_tokens
            FROM ai_usage
            WHERE created_at >= ?
            GROUP BY provider
            ORDER BY requests DESC
            "#,
        )
        .bind(&cutoff_str)
        .fetch_all(&self.pool)
        .await?;

        Ok(AiUsageStats {
            total_requests,
            total_prompt_tokens: total_prompt,
            total_completion_tokens: total_completion,
            total_tokens: total_all,
            total_cost_usd: total_cost,
            total_latency_ms: total_latency,
            avg_latency_ms,
            avg_tokens_per_request,
            by_model,
            by_provider,
        })
    }
}
