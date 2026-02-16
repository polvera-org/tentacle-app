use std::collections::HashMap;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use thiserror::Error;

pub const KEY_DOCUMENTS_FOLDER: &str = "documents_folder";

const CREATE_CONFIG_TABLE_SQL: &str =
    "CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)";

pub struct ConfigStore {
    connection: Connection,
}

impl ConfigStore {
    pub fn new(app_data_dir: &Path) -> Result<Self, ConfigError> {
        std::fs::create_dir_all(app_data_dir)?;

        let database_path = app_data_dir.join("config.db");
        let connection = Connection::open(database_path)?;
        connection.execute(CREATE_CONFIG_TABLE_SQL, [])?;

        Ok(Self { connection })
    }

    pub fn get(&self, key: &str) -> Result<Option<String>, ConfigError> {
        let value = self
            .connection
            .query_row(
                "SELECT value FROM config WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()?;

        Ok(value)
    }

    pub fn set(&self, key: &str, value: &str) -> Result<(), ConfigError> {
        self.connection.execute(
            "INSERT INTO config (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;

        Ok(())
    }

    pub fn delete(&self, key: &str) -> Result<(), ConfigError> {
        self.connection
            .execute("DELETE FROM config WHERE key = ?1", params![key])?;

        Ok(())
    }

    pub fn get_all(&self) -> Result<HashMap<String, String>, ConfigError> {
        let mut statement = self.connection.prepare("SELECT key, value FROM config")?;
        let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;

        let mut config = HashMap::new();
        for row in rows {
            let (key, value): (String, String) = row?;
            config.insert(key, value);
        }

        Ok(config)
    }
}

pub fn default_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|path| path.join("com.tentacle.desktop"))
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}
