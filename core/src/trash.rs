use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use thiserror::Error;

const MARKDOWN_EXTENSION: &str = "md";
const RESERVED_TRASH_FOLDER: &str = ".trash";
pub const TRASH_RETENTION_DAYS: u64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrashedItem {
    pub id: String,
    pub file_name: String,
    pub original_folder_path: String,
    pub trash_path: String,
    pub deleted_at_unix_seconds: u64,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct TrashListResult {
    pub items: Vec<TrashedItem>,
    pub total_count: usize,
    pub total_size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct TrashStats {
    pub total_count: usize,
    pub total_size_bytes: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryStrategy {
    OriginalLocation,
    WithSuffix,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RecoveryResult {
    pub success: bool,
    pub recovered_to: String,
    pub conflict_handled: bool,
}

#[derive(Debug, Error)]
pub enum TrashError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    AlreadyExists(String),
}

pub struct TrashService;

impl TrashService {
    pub fn list_trash(documents_folder: &Path) -> Result<TrashListResult, TrashError> {
        let trash_root = documents_folder.join(RESERVED_TRASH_FOLDER);
        if !trash_root.exists() {
            return Ok(TrashListResult::default());
        }

        let mut files = Vec::new();
        collect_trashed_markdown_files(&trash_root, &trash_root, &mut files)?;
        files.sort_by(|a, b| a.trash_path.cmp(&b.trash_path));

        let total_size_bytes = files.iter().map(|item| item.size_bytes).sum();
        Ok(TrashListResult {
            total_count: files.len(),
            total_size_bytes,
            items: files,
        })
    }

    pub fn recover_item(
        documents_folder: &Path,
        trash_path: &str,
        strategy: RecoveryStrategy,
    ) -> Result<RecoveryResult, TrashError> {
        let trash_root = documents_folder.join(RESERVED_TRASH_FOLDER);
        let source = resolve_trash_item_path(&trash_root, trash_path)?;
        if !source.exists() {
            return Err(TrashError::NotFound(format!(
                "trash item \"{}\" was not found",
                trash_path
            )));
        }

        let destination_relative = normalize_trash_relative_path(trash_path)?;
        let destination = documents_folder.join(&destination_relative);

        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)?;
        }

        let (final_destination, conflict_handled) = if destination.exists() {
            match strategy {
                RecoveryStrategy::OriginalLocation => {
                    return Err(TrashError::AlreadyExists(format!(
                        "document already exists at \"{}\"",
                        path_to_unix_string(&destination_relative)
                    )));
                }
                RecoveryStrategy::WithSuffix => {
                    (build_unique_path_with_suffix(&destination)?, true)
                }
            }
        } else {
            (destination, false)
        };

        fs::rename(&source, &final_destination)?;
        cleanup_empty_directories_up_to(&source, &trash_root)?;

        let recovered_to = final_destination
            .strip_prefix(documents_folder)
            .ok()
            .map(path_to_unix_string)
            .unwrap_or_else(|| final_destination.to_string_lossy().to_string());

        Ok(RecoveryResult {
            success: true,
            recovered_to,
            conflict_handled,
        })
    }

    pub fn delete_permanently(documents_folder: &Path, trash_path: &str) -> Result<(), TrashError> {
        let trash_root = documents_folder.join(RESERVED_TRASH_FOLDER);
        let source = resolve_trash_item_path(&trash_root, trash_path)?;
        if !source.exists() {
            return Err(TrashError::NotFound(format!(
                "trash item \"{}\" was not found",
                trash_path
            )));
        }

        fs::remove_file(&source)?;
        cleanup_empty_directories_up_to(&source, &trash_root)?;
        Ok(())
    }

    pub fn clear_trash(documents_folder: &Path) -> Result<usize, TrashError> {
        let trash_root = documents_folder.join(RESERVED_TRASH_FOLDER);
        if !trash_root.exists() {
            return Ok(0);
        }

        let listing = Self::list_trash(documents_folder)?;
        for item in &listing.items {
            let source = resolve_trash_item_path(&trash_root, &item.trash_path)?;
            if source.exists() {
                fs::remove_file(source)?;
            }
        }

        remove_empty_directories_recursive(&trash_root)?;
        Ok(listing.total_count)
    }

    pub fn run_auto_cleanup(documents_folder: &Path) -> Result<usize, TrashError> {
        let trash_root = documents_folder.join(RESERVED_TRASH_FOLDER);
        if !trash_root.exists() {
            return Ok(0);
        }

        let listing = Self::list_trash(documents_folder)?;
        let now = SystemTime::now();
        let retention = Duration::from_secs(TRASH_RETENTION_DAYS * 24 * 60 * 60);

        let mut removed = 0usize;
        for item in &listing.items {
            let deleted_at = UNIX_EPOCH + Duration::from_secs(item.deleted_at_unix_seconds);
            if now.duration_since(deleted_at).unwrap_or_default() >= retention {
                let source = resolve_trash_item_path(&trash_root, &item.trash_path)?;
                if source.exists() {
                    fs::remove_file(source)?;
                    removed += 1;
                }
            }
        }

        remove_empty_directories_recursive(&trash_root)?;
        Ok(removed)
    }

    pub fn get_trash_stats(documents_folder: &Path) -> Result<TrashStats, TrashError> {
        let listing = Self::list_trash(documents_folder)?;
        Ok(TrashStats {
            total_count: listing.total_count,
            total_size_bytes: listing.total_size_bytes,
        })
    }
}

fn collect_trashed_markdown_files(
    root: &Path,
    current: &Path,
    output: &mut Vec<TrashedItem>,
) -> Result<(), TrashError> {
    for entry in fs::read_dir(current)? {
        let entry = entry?;
        let entry_path = entry.path();
        let metadata = entry.metadata()?;

        if metadata.is_dir() {
            collect_trashed_markdown_files(root, &entry_path, output)?;
            continue;
        }

        let extension = entry_path
            .extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        if extension != MARKDOWN_EXTENSION {
            continue;
        }

        let relative = entry_path
            .strip_prefix(root)
            .map_err(|_| TrashError::Validation("failed to compute trash-relative path".to_string()))?
            .to_path_buf();

        let file_name = entry.file_name().to_string_lossy().to_string();

        let original_folder_path = relative
            .parent()
            .map(path_to_unix_string)
            .unwrap_or_default();

        let deleted_at_unix_seconds = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        let relative_str = path_to_unix_string(&relative);

        output.push(TrashedItem {
            id: relative_str.clone(),
            file_name,
            original_folder_path,
            trash_path: relative_str,
            deleted_at_unix_seconds,
            size_bytes: metadata.len(),
        });
    }

    Ok(())
}

fn normalize_trash_relative_path(input: &str) -> Result<PathBuf, TrashError> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err(TrashError::Validation(
            "trash_path must not be empty".to_string(),
        ));
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err(TrashError::Validation(
            "trash_path must be relative".to_string(),
        ));
    }

    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => normalized.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(TrashError::Validation(
                    "trash_path contains invalid path segments".to_string(),
                ))
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(TrashError::Validation(
            "trash_path must not be empty".to_string(),
        ));
    }

    Ok(normalized)
}

fn resolve_trash_item_path(trash_root: &Path, trash_path: &str) -> Result<PathBuf, TrashError> {
    let relative = normalize_trash_relative_path(trash_path)?;
    Ok(trash_root.join(relative))
}

fn build_unique_path_with_suffix(path: &Path) -> Result<PathBuf, TrashError> {
    let parent = path.parent().ok_or_else(|| {
        TrashError::Validation("unable to recover file in root without parent".to_string())
    })?;

    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| TrashError::Validation("invalid file name".to_string()))?;

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();

    let mut counter = 1usize;
    loop {
        let candidate_name = if extension.is_empty() {
            format!("{stem} ({counter})")
        } else {
            format!("{stem} ({counter}).{extension}")
        };
        let candidate = parent.join(candidate_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
        counter += 1;
    }
}

fn path_to_unix_string(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn cleanup_empty_directories_up_to(path: &Path, stop_at: &Path) -> Result<(), TrashError> {
    let mut current = path.parent();
    while let Some(dir) = current {
        if dir == stop_at {
            break;
        }

        match fs::remove_dir(dir) {
            Ok(_) => {
                current = dir.parent();
            }
            Err(err) if err.kind() == std::io::ErrorKind::DirectoryNotEmpty => break,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => break,
            Err(err) => return Err(TrashError::Io(err)),
        }
    }
    Ok(())
}

fn remove_empty_directories_recursive(root: &Path) -> Result<(), TrashError> {
    if !root.exists() {
        return Ok(());
    }

    fn recurse(path: &Path) -> Result<bool, TrashError> {
        if !path.exists() {
            return Ok(true);
        }

        let mut is_empty = true;
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let entry_path = entry.path();
            if entry.metadata()?.is_dir() {
                let child_empty = recurse(&entry_path)?;
                if child_empty {
                    let _ = fs::remove_dir(&entry_path);
                } else {
                    is_empty = false;
                }
            } else {
                is_empty = false;
            }
        }
        Ok(is_empty)
    }

    if recurse(root)? {
        let _ = fs::remove_dir(root);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn temp_dir() -> PathBuf {
        let mut dir = std::env::temp_dir();
        let unique = format!(
            "tentacle-trash-test-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        dir.push(unique);
        fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn write_file(path: &Path, content: &str) {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("create parent");
        }
        let mut file = fs::File::create(path).expect("create file");
        file.write_all(content.as_bytes()).expect("write file");
    }

    #[test]
    fn list_trash_returns_items() {
        let docs = temp_dir();
        write_file(&docs.join(".trash/work/note.md"), "hello");

        let result = TrashService::list_trash(&docs).expect("list trash");
        assert_eq!(result.total_count, 1);
        assert_eq!(result.items[0].trash_path, "work/note.md");
        assert_eq!(result.items[0].original_folder_path, "work");

        let _ = fs::remove_dir_all(docs);
    }

    #[test]
    fn recover_item_restores_to_original_path() {
        let docs = temp_dir();
        write_file(&docs.join(".trash/work/note.md"), "hello");

        let result = TrashService::recover_item(
            &docs,
            "work/note.md",
            RecoveryStrategy::OriginalLocation,
        )
        .expect("recover");

        assert!(result.success);
        assert!(docs.join("work/note.md").exists());
        assert!(!docs.join(".trash/work/note.md").exists());

        let _ = fs::remove_dir_all(docs);
    }

    #[test]
    fn recover_item_with_suffix_handles_conflicts() {
        let docs = temp_dir();
        write_file(&docs.join(".trash/work/note.md"), "trashed");
        write_file(&docs.join("work/note.md"), "existing");

        let result = TrashService::recover_item(&docs, "work/note.md", RecoveryStrategy::WithSuffix)
            .expect("recover with suffix");

        assert!(result.conflict_handled);
        assert!(docs.join("work/note (1).md").exists());

        let _ = fs::remove_dir_all(docs);
    }
}
