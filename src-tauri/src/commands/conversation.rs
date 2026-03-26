use tauri::State;
use crate::database::repositories::conversation_repo::{ConversationRepository, ConversationWithPreview};
use crate::models::conversation::{Conversation, Message, AddMessageRequest};
use anyhow::Result;

#[tauri::command]
pub async fn get_conversation(
    document_id: String,
    repo: State<'_, ConversationRepository>,
) -> Result<Conversation, String> {
    repo.get_or_create(&document_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_conversation_with_preview(
    document_id: String,
    message_limit: i32,
    repo: State<'_, ConversationRepository>,
) -> Result<Option<ConversationWithPreview>, String> {
    repo.get_with_preview(&document_id, message_limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_message(
    request: AddMessageRequest,
    repo: State<'_, ConversationRepository>,
) -> Result<i64, String> {
    let message = Message::from_request(request);
    repo.add_message(&message).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_messages(
    conversation_id: String,
    repo: State<'_, ConversationRepository>,
) -> Result<Vec<Message>, String> {
    repo.get_messages(&conversation_id).await.map_err(|e| e.to_string())
}
