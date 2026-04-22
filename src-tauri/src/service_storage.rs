use std::path::PathBuf;
use tauri::{AppHandle, Manager};

pub(crate) fn session_dir_for_storage_key(app: &AppHandle, storage_key: &str) -> Option<PathBuf> {
    if storage_key.is_empty()
        || !storage_key
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return None;
    }

    app.path()
        .app_local_data_dir()
        .ok()
        .map(|dir| dir.join("sessions").join(storage_key))
}

pub(crate) fn data_store_identifier_for_storage_key(storage_key: &str) -> [u8; 16] {
    let mut state_a: u64 = 0xcbf29ce484222325;
    let mut state_b: u64 = 0x84222325cbf29ce4;

    for byte in storage_key.bytes() {
        state_a ^= u64::from(byte);
        state_a = state_a.wrapping_mul(0x100000001b3);

        state_b ^= u64::from(byte).wrapping_add(0x9e3779b97f4a7c15);
        state_b = state_b.wrapping_mul(0x100000001b3);
    }

    let mut identifier = [0u8; 16];
    identifier[..8].copy_from_slice(&state_a.to_be_bytes());
    identifier[8..].copy_from_slice(&state_b.to_be_bytes());
    identifier
}

#[cfg(test)]
mod tests {
    use super::data_store_identifier_for_storage_key;

    #[test]
    fn data_store_identifier_is_stable_for_same_storage_key() {
        let identifier = data_store_identifier_for_storage_key("storage-11111111");

        assert_eq!(
            identifier,
            data_store_identifier_for_storage_key("storage-11111111")
        );
    }

    #[test]
    fn data_store_identifier_differs_for_different_storage_keys() {
        assert_ne!(
            data_store_identifier_for_storage_key("storage-11111111"),
            data_store_identifier_for_storage_key("storage-22222222")
        );
    }
}
