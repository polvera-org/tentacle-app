use serde::{Deserialize, Serialize};
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use thiserror::Error;

const MARKDOWN_EXTENSION: &str = ".md";
const RESERVED_TRASH_FOLDER: &str = ".trash";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DocumentFolderPayload {
    pub path: String,
    pub name: String,
    pub parent_path: Option<String>,
    pub document_count: usize,
    pub subfolder_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct MoveDocumentResultPayload {
    pub document_id: String,
    pub from_folder_path: String,
    pub to_folder_path: String,
    pub destination_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct RenameDocumentFolderInputPayload {
    pub path: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DeleteDocumentFolderInputPayload {
    pub path: String,
    pub recursive: bool,
}

pub struct DocumentFoldersService;

impl DocumentFoldersService {
    pub fn list_folders(
        documents_folder: &Path,
    ) -> Result<Vec<DocumentFolderPayload>, DocumentFoldersError> {
        if !documents_folder.exists() {
            return Ok(Vec::new());
        }

        if !documents_folder.is_dir() {
            return Err(DocumentFoldersError::Validation(
                "documents folder must be a directory".to_owned(),
            ));
        }

        let mut folders: Vec<DocumentFolderPayload> = Vec::new();
        collect_folders(documents_folder, "", &mut folders)?;
        folders.sort_by(|a, b| a.path.cmp(&b.path));
        Ok(folders)
    }

    pub fn create_folder(
        documents_folder: &Path,
        folder_path: &str,
    ) -> Result<DocumentFolderPayload, DocumentFoldersError> {
        fs::create_dir_all(documents_folder)?;
        let normalized = normalize_folder_path(folder_path)?;
        if normalized.is_empty() {
            return Err(DocumentFoldersError::Validation(
                "cannot create the root folder".to_owned(),
            ));
        }
        reject_reserved_folder_path(&normalized)?;

        let absolute_path = folder_absolute_path(documents_folder, &normalized);
        ensure_within_documents_folder(documents_folder, &absolute_path)?;

        if absolute_path.exists() {
            return Err(DocumentFoldersError::AlreadyExists(format!(
                "folder \"{normalized}\" already exists"
            )));
        }

        fs::create_dir_all(&absolute_path)?;
        build_folder_payload(documents_folder, &normalized)
    }

    pub fn rename_folder(
        documents_folder: &Path,
        input: &RenameDocumentFolderInputPayload,
    ) -> Result<DocumentFolderPayload, DocumentFoldersError> {
        fs::create_dir_all(documents_folder)?;

        let source_path = normalize_folder_path(&input.path)?;
        if source_path.is_empty() {
            return Err(DocumentFoldersError::Validation(
                "cannot rename the root folder".to_owned(),
            ));
        }
        reject_reserved_folder_path(&source_path)?;

        let new_name = normalize_folder_name(&input.name)?;

        let source_absolute = folder_absolute_path(documents_folder, &source_path);
        ensure_within_documents_folder(documents_folder, &source_absolute)?;
        if !source_absolute.exists() || !source_absolute.is_dir() {
            return Err(DocumentFoldersError::NotFound(format!(
                "folder \"{source_path}\" was not found"
            )));
        }

        let parent_path = folder_parent_path(&source_path);
        let destination_path = if parent_path.is_empty() {
            new_name.clone()
        } else {
            format!("{parent_path}/{new_name}")
        };
        reject_reserved_folder_path(&destination_path)?;

        if destination_path == source_path {
            return build_folder_payload(documents_folder, &destination_path);
        }

        let destination_absolute = folder_absolute_path(documents_folder, &destination_path);
        ensure_within_documents_folder(documents_folder, &destination_absolute)?;

        if destination_absolute.exists() {
            return Err(DocumentFoldersError::AlreadyExists(format!(
                "folder \"{destination_path}\" already exists"
            )));
        }

        fs::rename(&source_absolute, &destination_absolute)?;
        build_folder_payload(documents_folder, &destination_path)
    }

    pub fn delete_folder(
        documents_folder: &Path,
        input: &DeleteDocumentFolderInputPayload,
    ) -> Result<(), DocumentFoldersError> {
        fs::create_dir_all(documents_folder)?;

        let normalized = normalize_folder_path(&input.path)?;
        if normalized.is_empty() {
            return Err(DocumentFoldersError::Validation(
                "cannot delete the root folder".to_owned(),
            ));
        }
        reject_reserved_folder_path(&normalized)?;

        let absolute_path = folder_absolute_path(documents_folder, &normalized);
        ensure_within_documents_folder(documents_folder, &absolute_path)?;

        if !absolute_path.exists() || !absolute_path.is_dir() {
            return Err(DocumentFoldersError::NotFound(format!(
                "folder \"{normalized}\" was not found"
            )));
        }

        if input.recursive {
            fs::remove_dir_all(&absolute_path)?;
            return Ok(());
        }

        match fs::remove_dir(&absolute_path) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == ErrorKind::DirectoryNotEmpty => {
                Err(DocumentFoldersError::NonEmptyFolder(format!(
                    "folder \"{normalized}\" is not empty"
                )))
            }
            Err(error) => Err(DocumentFoldersError::Io(error)),
        }
    }

    pub fn move_document_to_folder(
        documents_folder: &Path,
        document_id: &str,
        to_folder_path: &str,
    ) -> Result<MoveDocumentResultPayload, DocumentFoldersError> {
        fs::create_dir_all(documents_folder)?;

        let normalized_document_id = normalize_document_id(document_id).ok_or_else(|| {
            DocumentFoldersError::Validation("document_id must not be empty".to_owned())
        })?;

        let destination_folder_path = normalize_folder_path(to_folder_path)?;
        if !destination_folder_path.is_empty() {
            reject_reserved_folder_path(&destination_folder_path)?;
        }

        let source = find_document_markdown_file(documents_folder, &normalized_document_id)?
            .ok_or_else(|| {
                DocumentFoldersError::NotFound(format!(
                    "document \"{normalized_document_id}\" was not found"
                ))
            })?;

        let source_absolute = folder_absolute_path(documents_folder, &source.relative_path);
        ensure_within_documents_folder(documents_folder, &source_absolute)?;

        let source_file_name = source_absolute
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| {
                DocumentFoldersError::Validation(
                    "source markdown file must have a valid file name".to_owned(),
                )
            })?
            .to_owned();

        let destination_folder_absolute =
            folder_absolute_path(documents_folder, &destination_folder_path);
        ensure_within_documents_folder(documents_folder, &destination_folder_absolute)?;
        fs::create_dir_all(&destination_folder_absolute)?;

        let from_folder_path = folder_path_for_file_path(&source.relative_path);
        if from_folder_path == destination_folder_path {
            return Ok(MoveDocumentResultPayload {
                document_id: normalized_document_id,
                from_folder_path,
                to_folder_path: destination_folder_path,
                destination_path: source.relative_path,
            });
        }

        let destination_absolute =
            resolve_move_destination_path(&destination_folder_absolute, &source_file_name)?;
        ensure_within_documents_folder(documents_folder, &destination_absolute)?;

        fs::rename(&source_absolute, &destination_absolute)?;

        let destination_relative = normalize_relative_path(
            destination_absolute
                .strip_prefix(documents_folder)
                .map_err(|_| {
                    DocumentFoldersError::Validation(
                        "destination path escapes documents folder".to_owned(),
                    )
                })?
                .to_string_lossy()
                .as_ref(),
        )?;

        Ok(MoveDocumentResultPayload {
            document_id: normalized_document_id,
            from_folder_path,
            to_folder_path: destination_folder_path,
            destination_path: destination_relative,
        })
    }
}

#[derive(Debug, Error)]
pub enum DocumentFoldersError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    AlreadyExists(String),
    #[error("{0}")]
    NonEmptyFolder(String),
}

#[derive(Debug, Clone)]
struct FoundDocumentFile {
    relative_path: String,
}

fn collect_folders(
    documents_folder: &Path,
    relative_path: &str,
    folders: &mut Vec<DocumentFolderPayload>,
) -> Result<(), DocumentFoldersError> {
    let absolute_path = folder_absolute_path(documents_folder, relative_path);
    let mut subfolders: Vec<String> = Vec::new();
    let mut markdown_count: usize = 0;

    for entry in fs::read_dir(&absolute_path)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let name = entry.file_name().to_string_lossy().into_owned();

        if file_type.is_dir() {
            if name == RESERVED_TRASH_FOLDER {
                continue;
            }
            let child_path = join_relative_path(relative_path, &name);
            subfolders.push(child_path);
            continue;
        }

        if file_type.is_file() && is_markdown_file_name(&name) {
            markdown_count += 1;
        }
    }

    if !relative_path.is_empty() {
        folders.push(DocumentFolderPayload {
            path: relative_path.to_owned(),
            name: folder_name(relative_path),
            parent_path: folder_parent_path(relative_path).if_empty_none(),
            document_count: markdown_count,
            subfolder_count: subfolders.len(),
        });
    }

    subfolders.sort();
    for subfolder in subfolders {
        collect_folders(documents_folder, &subfolder, folders)?;
    }

    Ok(())
}

fn build_folder_payload(
    documents_folder: &Path,
    folder_path: &str,
) -> Result<DocumentFolderPayload, DocumentFoldersError> {
    let absolute_path = folder_absolute_path(documents_folder, folder_path);
    ensure_within_documents_folder(documents_folder, &absolute_path)?;

    if !absolute_path.exists() || !absolute_path.is_dir() {
        return Err(DocumentFoldersError::NotFound(format!(
            "folder \"{folder_path}\" was not found"
        )));
    }

    let mut document_count: usize = 0;
    let mut subfolder_count: usize = 0;

    for entry in fs::read_dir(&absolute_path)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let name = entry.file_name().to_string_lossy().into_owned();

        if file_type.is_dir() {
            if name != RESERVED_TRASH_FOLDER {
                subfolder_count += 1;
            }
            continue;
        }

        if file_type.is_file() && is_markdown_file_name(&name) {
            document_count += 1;
        }
    }

    Ok(DocumentFolderPayload {
        path: folder_path.to_owned(),
        name: folder_name(folder_path),
        parent_path: folder_parent_path(folder_path).if_empty_none(),
        document_count,
        subfolder_count,
    })
}

fn find_document_markdown_file(
    documents_folder: &Path,
    document_id: &str,
) -> Result<Option<FoundDocumentFile>, DocumentFoldersError> {
    let mut files: Vec<String> = Vec::new();
    collect_markdown_files(documents_folder, "", &mut files)?;
    files.sort();

    let mut fallback: Option<FoundDocumentFile> = None;

    for relative_path in files {
        let absolute_path = folder_absolute_path(documents_folder, &relative_path);
        let content = match fs::read_to_string(&absolute_path) {
            Ok(content) => content,
            Err(_) => continue,
        };

        let parsed_id = parse_frontmatter_id(&content);
        if parsed_id.as_deref() == Some(document_id) {
            return Ok(Some(FoundDocumentFile { relative_path }));
        }

        if parsed_id.is_none() {
            let file_stem = absolute_path.file_stem().and_then(|stem| stem.to_str());
            if file_stem == Some(document_id) && fallback.is_none() {
                fallback = Some(FoundDocumentFile { relative_path });
            }
        }
    }

    Ok(fallback)
}

fn collect_markdown_files(
    documents_folder: &Path,
    relative_path: &str,
    files: &mut Vec<String>,
) -> Result<(), DocumentFoldersError> {
    let absolute_path = folder_absolute_path(documents_folder, relative_path);

    for entry in fs::read_dir(&absolute_path)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let name = entry.file_name().to_string_lossy().into_owned();

        if file_type.is_dir() {
            if name == RESERVED_TRASH_FOLDER {
                continue;
            }
            let child_path = join_relative_path(relative_path, &name);
            collect_markdown_files(documents_folder, &child_path, files)?;
            continue;
        }

        if file_type.is_file() && is_markdown_file_name(&name) {
            files.push(join_relative_path(relative_path, &name));
        }
    }

    Ok(())
}

fn parse_frontmatter_id(content: &str) -> Option<String> {
    let normalized = content.replace("\r\n", "\n");
    if !normalized.starts_with("---\n") {
        return None;
    }

    let end_index = normalized.find("\n---\n")?;
    let frontmatter = &normalized[4..end_index];

    for line in frontmatter.lines() {
        let Some(separator) = line.find(':') else {
            continue;
        };
        let key = line[..separator].trim();
        if key != "id" {
            continue;
        }

        let raw_value = line[separator + 1..].trim();
        if raw_value == "null" {
            return None;
        }

        let unquoted = unquote_yaml_value(raw_value);
        return normalize_document_id(&unquoted);
    }

    None
}

fn unquote_yaml_value(value: &str) -> String {
    if value.starts_with('\"') && value.ends_with('\"') && value.len() >= 2 {
        return value[1..value.len() - 1]
            .replace("\\\"", "\"")
            .replace("\\\\", "\\");
    }

    value.to_owned()
}

fn resolve_move_destination_path(
    destination_folder_absolute: &Path,
    source_file_name: &str,
) -> Result<PathBuf, DocumentFoldersError> {
    let base_destination = destination_folder_absolute.join(source_file_name);
    if !base_destination.exists() {
        return Ok(base_destination);
    }

    let source_path = Path::new(source_file_name);
    let stem = source_path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .ok_or_else(|| {
            DocumentFoldersError::Validation(
                "source markdown file must have a valid stem".to_owned(),
            )
        })?;
    let extension = source_path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| format!(".{ext}"))
        .unwrap_or_default();

    let mut index: usize = 2;
    loop {
        let candidate_name = format!("{stem} ({index}){extension}");
        let candidate = destination_folder_absolute.join(candidate_name);
        if !candidate.exists() {
            return Ok(candidate);
        }
        index += 1;
    }
}

fn normalize_folder_name(raw_name: &str) -> Result<String, DocumentFoldersError> {
    let trimmed = raw_name.trim();
    if trimmed.is_empty() {
        return Err(DocumentFoldersError::Validation(
            "folder name must not be empty".to_owned(),
        ));
    }
    if trimmed == "." || trimmed == ".." {
        return Err(DocumentFoldersError::Validation(
            "folder name must not contain traversal segments".to_owned(),
        ));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(DocumentFoldersError::Validation(
            "folder name must not contain path separators".to_owned(),
        ));
    }
    if trimmed == RESERVED_TRASH_FOLDER {
        return Err(DocumentFoldersError::Validation(format!(
            "folder name \"{RESERVED_TRASH_FOLDER}\" is reserved"
        )));
    }

    Ok(trimmed.to_owned())
}

fn reject_reserved_folder_path(path: &str) -> Result<(), DocumentFoldersError> {
    if path
        .split('/')
        .any(|segment| !segment.is_empty() && segment == RESERVED_TRASH_FOLDER)
    {
        return Err(DocumentFoldersError::Validation(format!(
            "folder path segment \"{RESERVED_TRASH_FOLDER}\" is reserved"
        )));
    }
    Ok(())
}

fn normalize_folder_path(raw_path: &str) -> Result<String, DocumentFoldersError> {
    normalize_relative_path(raw_path)
}

fn normalize_relative_path(raw_path: &str) -> Result<String, DocumentFoldersError> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let normalized_separators = trimmed.replace('\\', "/");
    if normalized_separators.starts_with('/') || is_windows_drive_path(&normalized_separators) {
        return Err(DocumentFoldersError::Validation(
            "absolute paths are not allowed".to_owned(),
        ));
    }

    let mut normalized_parts: Vec<String> = Vec::new();
    for part in normalized_separators.split('/') {
        let segment = part.trim();
        if segment.is_empty() {
            continue;
        }
        if segment == "." || segment == ".." {
            return Err(DocumentFoldersError::Validation(
                "path traversal segments are not allowed".to_owned(),
            ));
        }
        normalized_parts.push(segment.to_owned());
    }

    Ok(normalized_parts.join("/"))
}

fn normalize_document_id(value: &str) -> Option<String> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return None;
    }

    if normalized.chars().any(|character| character.is_control()) {
        return None;
    }

    Some(normalized.to_owned())
}

fn is_windows_drive_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    if bytes.len() < 2 {
        return false;
    }

    bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn folder_absolute_path(documents_folder: &Path, folder_path: &str) -> PathBuf {
    if folder_path.is_empty() {
        return documents_folder.to_path_buf();
    }

    let mut path = documents_folder.to_path_buf();
    for segment in folder_path.split('/') {
        if segment.is_empty() {
            continue;
        }
        path.push(segment);
    }
    path
}

fn ensure_within_documents_folder(
    documents_folder: &Path,
    candidate_path: &Path,
) -> Result<(), DocumentFoldersError> {
    if !candidate_path.starts_with(documents_folder) {
        return Err(DocumentFoldersError::Validation(
            "path escapes documents folder".to_owned(),
        ));
    }
    Ok(())
}

fn is_markdown_file_name(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(MARKDOWN_EXTENSION)
}

fn join_relative_path(prefix: &str, name: &str) -> String {
    if prefix.is_empty() {
        return name.to_owned();
    }

    format!("{prefix}/{name}")
}

fn folder_name(path: &str) -> String {
    path.rsplit('/').next().unwrap_or("").to_owned()
}

fn folder_parent_path(path: &str) -> String {
    if let Some(index) = path.rfind('/') {
        return path[..index].to_owned();
    }
    String::new()
}

fn folder_path_for_file_path(path: &str) -> String {
    if let Some(index) = path.rfind('/') {
        return path[..index].to_owned();
    }
    String::new()
}

trait StringExt {
    fn if_empty_none(self) -> Option<String>;
}

impl StringExt for String {
    fn if_empty_none(self) -> Option<String> {
        if self.is_empty() {
            return None;
        }
        Some(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path() -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock must be after unix epoch")
            .as_nanos();
        let thread_id = format!("{:?}", std::thread::current().id())
            .chars()
            .filter(|character| character.is_alphanumeric())
            .collect::<String>();
        std::env::temp_dir().join(format!("tentacle-folders-test-{timestamp}-{thread_id}"))
    }

    fn write_markdown(path: &Path, id: &str, body: &str) {
        let content = format!(
            "---\nid: \"{id}\"\ncreated_at: \"2026-02-16T00:00:00Z\"\nupdated_at: \"2026-02-16T00:00:00Z\"\n---\n\n# Title\n\n{body}\n"
        );
        fs::write(path, content).expect("markdown file should be written");
    }

    #[test]
    fn normalizes_folder_paths_and_skips_reserved_trash_listing() {
        let normalized =
            normalize_folder_path("  alpha\\beta//gamma/  ").expect("path normalization");
        assert_eq!(normalized, "alpha/beta/gamma");
        assert_eq!(
            normalize_folder_path("").expect("empty path should normalize to root"),
            String::new()
        );

        let temp_dir = unique_temp_path();
        fs::create_dir_all(temp_dir.join("alpha/sub")).expect("create folders");
        fs::create_dir_all(temp_dir.join(".trash/ignored")).expect("create trash");

        let listed = DocumentFoldersService::list_folders(&temp_dir).expect("list folders");
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].path, "alpha");
        assert_eq!(listed[0].subfolder_count, 1);
        assert_eq!(listed[1].path, "alpha/sub");

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn rejects_traversal_paths() {
        let temp_dir = unique_temp_path();
        fs::create_dir_all(&temp_dir).expect("create root");

        let create_error = DocumentFoldersService::create_folder(&temp_dir, "../escape")
            .expect_err("traversal create should fail");
        assert!(matches!(create_error, DocumentFoldersError::Validation(_)));

        let delete_error = DocumentFoldersService::delete_folder(
            &temp_dir,
            &DeleteDocumentFolderInputPayload {
                path: "./notes".to_owned(),
                recursive: true,
            },
        )
        .expect_err("traversal delete should fail");
        assert!(matches!(delete_error, DocumentFoldersError::Validation(_)));

        let move_error =
            DocumentFoldersService::move_document_to_folder(&temp_dir, "doc-1", "../../target")
                .expect_err("traversal move should fail");
        assert!(matches!(move_error, DocumentFoldersError::Validation(_)));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn create_rename_and_delete_folder_behaviors() {
        let temp_dir = unique_temp_path();
        fs::create_dir_all(&temp_dir).expect("create root");

        let created = DocumentFoldersService::create_folder(&temp_dir, "work/projects")
            .expect("create nested folder");
        assert_eq!(created.path, "work/projects");
        assert_eq!(created.parent_path.as_deref(), Some("work"));

        write_markdown(&temp_dir.join("work/projects/one.md"), "doc-1", "hello");

        let renamed = DocumentFoldersService::rename_folder(
            &temp_dir,
            &RenameDocumentFolderInputPayload {
                path: "work/projects".to_owned(),
                name: "archive".to_owned(),
            },
        )
        .expect("rename folder");
        assert_eq!(renamed.path, "work/archive");
        assert_eq!(renamed.document_count, 1);

        let non_recursive_error = DocumentFoldersService::delete_folder(
            &temp_dir,
            &DeleteDocumentFolderInputPayload {
                path: "work".to_owned(),
                recursive: false,
            },
        )
        .expect_err("non-empty non-recursive delete should fail");
        assert!(matches!(
            non_recursive_error,
            DocumentFoldersError::NonEmptyFolder(_)
        ));

        DocumentFoldersService::delete_folder(
            &temp_dir,
            &DeleteDocumentFolderInputPayload {
                path: "work".to_owned(),
                recursive: true,
            },
        )
        .expect("recursive delete should succeed");
        assert!(!temp_dir.join("work").exists());

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn move_document_handles_name_collisions_with_suffixes() {
        let temp_dir = unique_temp_path();
        fs::create_dir_all(temp_dir.join("source")).expect("create source");
        fs::create_dir_all(temp_dir.join("destination")).expect("create destination");

        let source_file = temp_dir.join("source/Note.md");
        let source_content = "---\nid: \"doc-123\"\ncreated_at: \"2026-02-16T00:00:00Z\"\nupdated_at: \"2026-02-16T00:00:00Z\"\n---\n\n# Note\n\ncontent\n";
        fs::write(&source_file, source_content).expect("write source doc");

        let destination_file = temp_dir.join("destination/Note.md");
        write_markdown(&destination_file, "doc-other", "existing");

        let moved =
            DocumentFoldersService::move_document_to_folder(&temp_dir, "doc-123", "destination")
                .expect("move document with collision");

        assert_eq!(moved.document_id, "doc-123");
        assert_eq!(moved.from_folder_path, "source");
        assert_eq!(moved.to_folder_path, "destination");
        assert_eq!(moved.destination_path, "destination/Note (2).md");

        assert!(!source_file.exists());
        let moved_content =
            fs::read_to_string(temp_dir.join(&moved.destination_path)).expect("read moved file");
        assert_eq!(moved_content, source_content);

        let _ = fs::remove_dir_all(temp_dir);
    }
}
