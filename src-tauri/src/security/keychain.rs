use anyhow::Result;
use directories::ProjectDirs;
use rand::Rng;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::PathBuf;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

const SERVICE_NAME: &str = "immersive-ai-reader";
const FALLBACK_FILE: &str = "secrets.json";

fn get_config_dir() -> Option<PathBuf> {
    ProjectDirs::from("com", "immersive-ai-reader", "ImmersiveAIReader")
        .map(|dirs| dirs.config_dir().to_path_buf())
}

fn get_fallback_path() -> Option<PathBuf> {
    get_config_dir().map(|p| p.join(FALLBACK_FILE))
}

fn encrypt_data(data: &str, key: &[u8]) -> Result<Vec<u8>> {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };
    use rand::Rng;

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| anyhow::anyhow!("Failed to create cipher: {}", e))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data.as_bytes())
        .map_err(|e| anyhow::anyhow!("Encryption failed: {}", e))?;

    let mut result = nonce_bytes.to_vec();
    result.extend(ciphertext);
    Ok(result)
}

fn decrypt_data(encrypted: &[u8], key: &[u8]) -> Result<String> {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };

    if encrypted.len() < 12 {
        anyhow::bail!("Invalid encrypted data");
    }

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| anyhow::anyhow!("Failed to create cipher: {}", e))?;

    let nonce = Nonce::from_slice(&encrypted[..12]);
    let ciphertext = &encrypted[12..];

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow::anyhow!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext)
        .map_err(|e| anyhow::anyhow!("Invalid UTF-8 in decrypted data: {}", e))
}

fn get_master_key() -> Result<[u8; 32]> {
    let config_dir = get_config_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?;

    fs::create_dir_all(&config_dir)?;

    let key_file = config_dir.join(".master.key");
    let key_file_permissions = 0o600;

    if key_file.exists() {
        let mut file = fs::File::open(&key_file)?;
        let mut key_bytes = [0u8; 32];
        file.read_exact(&mut key_bytes)?;
        Ok(key_bytes)
    } else {
        let mut key_bytes = [0u8; 32];
        rand::thread_rng().fill(&mut key_bytes);

        let mut file = fs::File::create(&key_file)?;
        #[cfg(unix)]
        file.set_permissions(fs::Permissions::from_mode(key_file_permissions))?;
        file.write_all(&key_bytes)?;

        Ok(key_bytes)
    }
}

fn save_to_fallback(provider: &str, api_key: &str) -> Result<()> {
    let fallback_path = get_fallback_path()
        .ok_or_else(|| anyhow::anyhow!("Could not determine fallback path"))?;

    let config_dir = get_config_dir()
        .ok_or_else(|| anyhow::anyhow!("Could not determine config directory"))?;
    fs::create_dir_all(&config_dir)?;

    let key = get_master_key()?;

    let mut secrets: HashMap<String, String> = if fallback_path.exists() {
        let encrypted = fs::read(&fallback_path)?;
        let json = decrypt_data(&encrypted, &key)?;
        serde_json::from_str(&json).unwrap_or_default()
    } else {
        HashMap::new()
    };

    secrets.insert(provider.to_string(), api_key.to_string());

    let json = serde_json::to_string(&secrets)?;
    let encrypted = encrypt_data(&json, &key)?;
    fs::write(&fallback_path, encrypted)?;

    Ok(())
}

fn get_from_fallback(provider: &str) -> Result<String> {
    let fallback_path = get_fallback_path()
        .ok_or_else(|| anyhow::anyhow!("Could not determine fallback path"))?;

    if !fallback_path.exists() {
        return Err(anyhow::anyhow!("No fallback secrets found"));
    }

    let key = get_master_key()?;
    let encrypted = fs::read(&fallback_path)?;
    let json = decrypt_data(&encrypted, &key)?;

    let secrets: HashMap<String, String> = serde_json::from_str(&json)
        .map_err(|e| anyhow::anyhow!("Invalid secrets format: {}", e))?;

    secrets
        .get(provider)
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("API key not found for provider"))
}

fn delete_from_fallback(provider: &str) -> Result<()> {
    let fallback_path = get_fallback_path()
        .ok_or_else(|| anyhow::anyhow!("Could not determine fallback path"))?;

    if !fallback_path.exists() {
        return Ok(());
    }

    let key = get_master_key()?;
    let encrypted = fs::read(&fallback_path)?;
    let json = decrypt_data(&encrypted, &key)?;

    let mut secrets: HashMap<String, String> = serde_json::from_str(&json)
        .map_err(|e| anyhow::anyhow!("Invalid secrets format: {}", e))?;

    secrets.remove(provider);

    if secrets.is_empty() {
        fs::remove_file(&fallback_path)?;
    } else {
        let json = serde_json::to_string(&secrets)?;
        let encrypted = encrypt_data(&json, &key)?;
        fs::write(&fallback_path, encrypted)?;
    }

    Ok(())
}

pub fn save_api_key(provider: &str, api_key: &str) -> Result<()> {
    // Try system keyring first
    let entry = match keyring::Entry::new(SERVICE_NAME, provider) {
        Ok(e) => e,
        Err(_) => {
            // Keyring not available, use fallback
            return save_to_fallback(provider, api_key);
        }
    };

    match entry.set_password(api_key) {
        Ok(_) => Ok(()),
        Err(e) => {
            // Keyring failed, use fallback
            if e.to_string().contains("org.freedesktop.DBus")
                || e.to_string().contains("ServiceUnknown")
                || e.to_string().contains("secret service")
            {
                save_to_fallback(provider, api_key)
            } else {
                Err(anyhow::anyhow!("Failed to save API key: {}", e))
            }
        }
    }
}

pub fn get_api_key(provider: &str) -> Result<String> {
    // Try system keyring first
    if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, provider) {
        match entry.get_password() {
            Ok(key) => return Ok(key),
            Err(e) => {
                // Check if it's a keyring service error
                let err_str = e.to_string();
                if !err_str.contains("org.freedesktop.DBus")
                    && !err_str.contains("ServiceUnknown")
                    && !err_str.contains("secret service")
                    && !err_str.contains("NotFound")
                {
                    // Real error, not just missing key
                    return Err(anyhow::anyhow!("Failed to get API key: {}", e));
                }
            }
        }
    }

    // Try fallback
    get_from_fallback(provider)
}

pub fn delete_api_key(provider: &str) -> Result<()> {
    // Try system keyring first
    if let Ok(entry) = keyring::Entry::new(SERVICE_NAME, provider) {
        match entry.delete_password() {
            Ok(_) => return Ok(()),
            Err(e) => {
                let err_str = e.to_string();
                if !err_str.contains("org.freedesktop.DBus")
                    && !err_str.contains("ServiceUnknown")
                    && !err_str.contains("secret service")
                    && !err_str.contains("NotFound")
                {
                    // Real error, not just missing
                    return Err(anyhow::anyhow!("Failed to delete API key: {}", e));
                }
            }
        }
    }

    // Try fallback
    delete_from_fallback(provider)
}
