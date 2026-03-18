use anyhow::Result;

const SERVICE_NAME: &str = "immersive-ai-reader";

pub fn save_api_key(provider: &str, api_key: &str) -> Result<()> {
    let entry = keyring::Entry::new(SERVICE_NAME, provider)
        .map_err(|e| anyhow::anyhow!("Failed to create keyring entry: {}", e))?;

    entry.set_password(api_key)
        .map_err(|e| anyhow::anyhow!("Failed to save API key: {}", e))
}

pub fn get_api_key(provider: &str) -> Result<String> {
    let entry = keyring::Entry::new(SERVICE_NAME, provider)
        .map_err(|e| anyhow::anyhow!("Failed to create keyring entry: {}", e))?;

    entry.get_password()
        .map_err(|e| anyhow::anyhow!("Failed to get API key: {}", e))
}

pub fn delete_api_key(provider: &str) -> Result<()> {
    let entry = keyring::Entry::new(SERVICE_NAME, provider)
        .map_err(|e| anyhow::anyhow!("Failed to create keyring entry: {}", e))?;

    entry.delete_password()
        .map_err(|e| anyhow::anyhow!("Failed to delete API key: {}", e))
}
