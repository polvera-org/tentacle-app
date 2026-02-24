use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
use thiserror::Error;

const MARKDOWN_EXTENSION: &str = ".md";
const RESERVED_TRASH_FOLDER: &str = ".trash";
const DEFAULT_TITLE: &str = "Untitled";

static ID_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StoredDocument {
    pub id: String,
    pub title: String,
    pub body: String,
    pub folder_path: String,
    pub tags: Vec<String>,
    pub tags_locked: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct StoredDocumentListItem {
    pub id: String,
    pub title: String,
    pub folder_path: String,
    pub tags: Vec<String>,
    pub tags_locked: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
pub struct CreateDocumentInput {
    pub title: Option<String>,
    pub body: Option<String>,
    pub folder_path: Option<String>,
    pub tags: Vec<String>,
    pub tags_locked: Option<bool>,
    pub id: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TagUpdateMode {
    Replace,
    Add,
    Remove,
}

#[derive(Debug, Error)]
pub enum DocumentStoreError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Validation(String),
    #[error("{0}")]
    NotFound(String),
    #[error("{0}")]
    AlreadyExists(String),
}

#[derive(Debug, Clone)]
struct MarkdownFrontmatter {
    id: String,
    created_at: String,
    updated_at: String,
    tags: Vec<String>,
    tags_locked: bool,
}

#[derive(Debug, Clone)]
struct ParsedFrontmatterMetadata {
    id: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    tags: Vec<String>,
    tags_locked: Option<bool>,
}

impl Default for ParsedFrontmatterMetadata {
    fn default() -> Self {
        Self {
            id: None,
            created_at: None,
            updated_at: None,
            tags: Vec::new(),
            tags_locked: None,
        }
    }
}

#[derive(Debug, Clone)]
struct StoredDocumentRecord {
    metadata: MarkdownFrontmatter,
    title: String,
    body: String,
}

#[derive(Debug, Clone)]
struct StoredDocumentReadResult {
    record: StoredDocumentRecord,
    rewrite_metadata: bool,
}

#[derive(Debug, Clone)]
struct StoredMarkdownFile {
    name: String,
    absolute_path: PathBuf,
    relative_path: String,
    title_from_file_name: String,
    relative_folder_path: String,
}

pub fn list_documents(
    documents_folder: &Path,
) -> Result<Vec<StoredDocumentListItem>, DocumentStoreError> {
    if !documents_folder.exists() {
        return Ok(Vec::new());
    }
    if !documents_folder.is_dir() {
        return Err(DocumentStoreError::Validation(
            "documents folder must be a directory".to_owned(),
        ));
    }

    let mut files = list_stored_markdown_files(documents_folder)?;
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    let mut seen_ids: HashSet<String> = HashSet::new();
    let mut documents: Vec<StoredDocumentListItem> = Vec::new();

    for file in files {
        let mut read_result = match read_stored_document_from_file(documents_folder, &file, None) {
            Ok(result) => result,
            Err(DocumentStoreError::Io(error)) => {
                log::warn!(
                    "[document_store] failed to read \"{}\": {}",
                    file.relative_path,
                    error
                );
                continue;
            }
            Err(error) => return Err(error),
        };

        let mut should_rewrite = read_result.rewrite_metadata;
        if seen_ids.contains(&read_result.record.metadata.id) {
            let replacement_id = generate_unique_document_id(&seen_ids);
            read_result.record.metadata.id = replacement_id;
            read_result.record.metadata.updated_at = now_iso_string_utc();
            should_rewrite = true;
        }

        seen_ids.insert(read_result.record.metadata.id.clone());
        if should_rewrite {
            write_stored_document_to_file(&file.absolute_path, &read_result.record)?;
        }

        documents.push(map_stored_record_to_list_item(
            &read_result.record,
            &file.relative_folder_path,
        ));
    }

    documents.sort_by(|a, b| {
        b.updated_at
            .cmp(&a.updated_at)
            .then_with(|| a.id.cmp(&b.id))
    });

    Ok(documents)
}

pub fn read_document(
    documents_folder: &Path,
    document_id: &str,
) -> Result<StoredDocument, DocumentStoreError> {
    let normalized_id = normalize_document_id(document_id).ok_or_else(|| {
        DocumentStoreError::Validation("document_id must not be empty".to_owned())
    })?;

    let file =
        find_stored_markdown_file_by_id(documents_folder, &normalized_id)?.ok_or_else(|| {
            DocumentStoreError::NotFound(format!("document \"{normalized_id}\" was not found"))
        })?;

    let read_result =
        read_stored_document_from_file(documents_folder, &file, Some(&normalized_id))?;
    if read_result.rewrite_metadata {
        write_stored_document_to_file(&file.absolute_path, &read_result.record)?;
    }

    Ok(map_stored_record_to_document(
        &read_result.record,
        &file.relative_folder_path,
    ))
}

pub fn create_document(
    documents_folder: &Path,
    input: &CreateDocumentInput,
) -> Result<StoredDocument, DocumentStoreError> {
    ensure_documents_folder_exists(documents_folder)?;

    let folder_path = normalize_folder_path(input.folder_path.as_deref().unwrap_or_default())?;
    if !folder_path.is_empty() {
        reject_reserved_folder_path(&folder_path)?;
    }

    let folder_absolute_path = folder_absolute_path(documents_folder, &folder_path);
    ensure_within_documents_folder(documents_folder, &folder_absolute_path)?;
    fs::create_dir_all(&folder_absolute_path)?;

    let now = now_iso_string_utc();
    let mut document_id = if let Some(requested) = input.id.as_deref() {
        let normalized = normalize_document_id(requested)
            .ok_or_else(|| DocumentStoreError::Validation("id must not be empty".to_owned()))?;
        if find_stored_markdown_file_by_id(documents_folder, &normalized)?.is_some() {
            return Err(DocumentStoreError::AlreadyExists(format!(
                "document \"{normalized}\" already exists"
            )));
        }
        normalized
    } else {
        generate_document_id()
    };

    while find_stored_markdown_file_by_id(documents_folder, &document_id)?.is_some() {
        document_id = generate_document_id();
    }

    let base_title = sanitize_title_for_file_name(input.title.as_deref());
    let mut next_title = resolve_unique_title(documents_folder, &folder_path, &base_title)?;
    let mut suffix_counter: usize = 2;

    loop {
        let file_path = folder_absolute_path.join(format!("{next_title}{MARKDOWN_EXTENSION}"));
        let record = StoredDocumentRecord {
            metadata: MarkdownFrontmatter {
                id: document_id.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
                tags: normalize_tags(input.tags.iter().map(|tag| tag.as_str())),
                tags_locked: input.tags_locked.unwrap_or(false),
            },
            title: next_title.clone(),
            body: input.body.clone().unwrap_or_default(),
        };

        match write_stored_document_new_file(&file_path, &record) {
            Ok(()) => {
                return Ok(map_stored_record_to_document(&record, &folder_path));
            }
            Err(DocumentStoreError::Io(error)) if error.kind() == ErrorKind::AlreadyExists => {
                next_title = format!("{base_title} ({suffix_counter})");
                suffix_counter += 1;
            }
            Err(error) => return Err(error),
        }
    }
}

pub fn update_document_tags(
    documents_folder: &Path,
    document_id: &str,
    tags: &[String],
    mode: TagUpdateMode,
) -> Result<StoredDocument, DocumentStoreError> {
    let normalized_id = normalize_document_id(document_id).ok_or_else(|| {
        DocumentStoreError::Validation("document_id must not be empty".to_owned())
    })?;

    let file =
        find_stored_markdown_file_by_id(documents_folder, &normalized_id)?.ok_or_else(|| {
            DocumentStoreError::NotFound(format!("document \"{normalized_id}\" was not found"))
        })?;

    let mut read_result =
        read_stored_document_from_file(documents_folder, &file, Some(&normalized_id))?;
    let incoming_tags = normalize_tags(tags.iter().map(|tag| tag.as_str()));

    let next_tags = match mode {
        TagUpdateMode::Replace => incoming_tags,
        TagUpdateMode::Add => {
            let mut merged =
                normalize_tags(read_result.record.metadata.tags.iter().map(|t| t.as_str()));
            for tag in incoming_tags {
                if !merged.iter().any(|existing| existing == &tag) {
                    merged.push(tag);
                }
            }
            merged
        }
        TagUpdateMode::Remove => {
            let to_remove: HashSet<String> = incoming_tags.into_iter().collect();
            normalize_tags(read_result.record.metadata.tags.iter().map(|t| t.as_str()))
                .into_iter()
                .filter(|tag| !to_remove.contains(tag))
                .collect()
        }
    };

    read_result.record.metadata.tags = next_tags;
    read_result.record.metadata.updated_at = now_iso_string_utc();

    write_stored_document_to_file(&file.absolute_path, &read_result.record)?;
    Ok(map_stored_record_to_document(
        &read_result.record,
        &file.relative_folder_path,
    ))
}

pub fn find_document_by_id(
    documents_folder: &Path,
    document_id: &str,
) -> Result<Option<StoredDocumentListItem>, DocumentStoreError> {
    let normalized_id = normalize_document_id(document_id).ok_or_else(|| {
        DocumentStoreError::Validation("document_id must not be empty".to_owned())
    })?;

    let Some(file) = find_stored_markdown_file_by_id(documents_folder, &normalized_id)? else {
        return Ok(None);
    };

    let read_result =
        read_stored_document_from_file(documents_folder, &file, Some(&normalized_id))?;
    if read_result.rewrite_metadata {
        write_stored_document_to_file(&file.absolute_path, &read_result.record)?;
    }

    Ok(Some(map_stored_record_to_list_item(
        &read_result.record,
        &file.relative_folder_path,
    )))
}

pub fn delete_document(
    documents_folder: &Path,
    document_id: &str,
) -> Result<StoredDocument, DocumentStoreError> {
    let normalized_id = normalize_document_id(document_id).ok_or_else(|| {
        DocumentStoreError::Validation("document_id must not be empty".to_owned())
    })?;

    let file =
        find_stored_markdown_file_by_id(documents_folder, &normalized_id)?.ok_or_else(|| {
            DocumentStoreError::NotFound(format!("document \"{normalized_id}\" was not found"))
        })?;

    let read_result =
        read_stored_document_from_file(documents_folder, &file, Some(&normalized_id))?;
    let document = map_stored_record_to_document(&read_result.record, &file.relative_folder_path);

    // Build trash destination path preserving folder structure
    let trash_folder_path = if file.relative_folder_path.is_empty() {
        PathBuf::from(RESERVED_TRASH_FOLDER)
    } else {
        PathBuf::from(RESERVED_TRASH_FOLDER).join(&file.relative_folder_path)
    };
    let trash_absolute_path = documents_folder.join(&trash_folder_path);
    fs::create_dir_all(&trash_absolute_path)?;

    // Move the file to trash
    let trash_file_path = trash_absolute_path.join(&file.name);

    // If a file already exists at the destination, add a suffix to make it unique
    let final_trash_path = if trash_file_path.exists() {
        let mut counter: usize = 1;
        loop {
            let file_stem = file.name.trim_end_matches(MARKDOWN_EXTENSION);
            let candidate = trash_absolute_path.join(format!("{file_stem} ({}){MARKDOWN_EXTENSION}", counter));
            if !candidate.exists() {
                break candidate;
            }
            counter += 1;
        }
    } else {
        trash_file_path
    };

    fs::rename(&file.absolute_path, &final_trash_path)?;

    Ok(document)
}

fn ensure_documents_folder_exists(documents_folder: &Path) -> Result<(), DocumentStoreError> {
    fs::create_dir_all(documents_folder)?;
    if !documents_folder.is_dir() {
        return Err(DocumentStoreError::Validation(
            "documents folder must be a directory".to_owned(),
        ));
    }
    Ok(())
}

fn map_stored_record_to_document(
    record: &StoredDocumentRecord,
    relative_folder_path: &str,
) -> StoredDocument {
    StoredDocument {
        id: record.metadata.id.clone(),
        title: normalize_title(Some(record.title.as_str())),
        body: normalize_line_endings(&record.body).trim().to_owned(),
        folder_path: relative_folder_path.to_owned(),
        tags: normalize_tags(record.metadata.tags.iter().map(|tag| tag.as_str())),
        tags_locked: record.metadata.tags_locked,
        created_at: record.metadata.created_at.clone(),
        updated_at: record.metadata.updated_at.clone(),
    }
}

fn map_stored_record_to_list_item(
    record: &StoredDocumentRecord,
    relative_folder_path: &str,
) -> StoredDocumentListItem {
    StoredDocumentListItem {
        id: record.metadata.id.clone(),
        title: normalize_title(Some(record.title.as_str())),
        folder_path: relative_folder_path.to_owned(),
        tags: normalize_tags(record.metadata.tags.iter().map(|tag| tag.as_str())),
        tags_locked: record.metadata.tags_locked,
        created_at: record.metadata.created_at.clone(),
        updated_at: record.metadata.updated_at.clone(),
    }
}

fn list_stored_markdown_files(
    documents_folder: &Path,
) -> Result<Vec<StoredMarkdownFile>, DocumentStoreError> {
    if !documents_folder.exists() {
        return Ok(Vec::new());
    }
    if !documents_folder.is_dir() {
        return Err(DocumentStoreError::Validation(
            "documents folder must be a directory".to_owned(),
        ));
    }

    let mut files = Vec::new();
    collect_markdown_files(documents_folder, "", &mut files)?;
    Ok(files)
}

fn collect_markdown_files(
    documents_folder: &Path,
    relative_folder_path: &str,
    files: &mut Vec<StoredMarkdownFile>,
) -> Result<(), DocumentStoreError> {
    let absolute_folder_path = folder_absolute_path(documents_folder, relative_folder_path);
    ensure_within_documents_folder(documents_folder, &absolute_folder_path)?;

    for entry in fs::read_dir(&absolute_folder_path)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let name = entry.file_name().to_string_lossy().into_owned();

        if file_type.is_dir() {
            if name == RESERVED_TRASH_FOLDER {
                continue;
            }

            let child_relative_folder_path = join_relative_path(relative_folder_path, &name);
            collect_markdown_files(documents_folder, &child_relative_folder_path, files)?;
            continue;
        }

        if !file_type.is_file() || !is_markdown_file_name(&name) {
            continue;
        }

        let relative_file_path = join_relative_path(relative_folder_path, &name);
        let absolute_file_path = folder_absolute_path(documents_folder, &relative_file_path);
        ensure_within_documents_folder(documents_folder, &absolute_file_path)?;

        let title_from_file_name = normalize_title(Some(remove_markdown_extension(&name)));
        files.push(StoredMarkdownFile {
            name,
            absolute_path: absolute_file_path,
            relative_path: relative_file_path,
            title_from_file_name,
            relative_folder_path: relative_folder_path.to_owned(),
        });
    }

    Ok(())
}

fn find_stored_markdown_file_by_id(
    documents_folder: &Path,
    document_id: &str,
) -> Result<Option<StoredMarkdownFile>, DocumentStoreError> {
    if !documents_folder.exists() {
        return Ok(None);
    }
    if !documents_folder.is_dir() {
        return Err(DocumentStoreError::Validation(
            "documents folder must be a directory".to_owned(),
        ));
    }

    let normalized_id = normalize_document_id(document_id).ok_or_else(|| {
        DocumentStoreError::Validation("document_id must not be empty".to_owned())
    })?;

    let mut files = list_stored_markdown_files(documents_folder)?;
    files.sort_by(|a, b| a.relative_path.cmp(&b.relative_path));

    let mut fallback_match: Option<StoredMarkdownFile> = None;
    let mut prefix_matches: Vec<StoredMarkdownFile> = Vec::new();

    for file in files {
        let content = match fs::read_to_string(&file.absolute_path) {
            Ok(content) => content,
            Err(error) => {
                log::warn!(
                    "[document_store] failed to read \"{}\" while looking up id \"{}\": {}",
                    file.relative_path,
                    normalized_id,
                    error
                );
                continue;
            }
        };

        let parsed_id = parse_frontmatter_id(&content);

        // Exact match - highest priority
        if parsed_id.as_deref() == Some(normalized_id.as_str()) {
            return Ok(Some(file));
        }

        // Prefix match on frontmatter ID
        if let Some(ref id) = parsed_id {
            if id.starts_with(&normalized_id) {
                prefix_matches.push(file.clone());
                continue;
            }
        }

        // Fallback: match filename (for documents without frontmatter ID)
        if parsed_id.is_none()
            && file.title_from_file_name == normalized_id
            && fallback_match.is_none()
        {
            fallback_match = Some(file);
        }
    }

    // If we have exactly one prefix match, use it
    if prefix_matches.len() == 1 {
        return Ok(Some(prefix_matches.into_iter().next().unwrap()));
    }

    // If we have multiple prefix matches, that's ambiguous - return error with helpful message
    if prefix_matches.len() > 1 {
        return Err(DocumentStoreError::Validation(format!(
            "ambiguous document id \"{}\": matches {} documents. Use a longer prefix to uniquely identify the document.",
            normalized_id,
            prefix_matches.len()
        )));
    }

    Ok(fallback_match)
}

fn read_stored_document_from_file(
    _documents_folder: &Path,
    file: &StoredMarkdownFile,
    fallback_id: Option<&str>,
) -> Result<StoredDocumentReadResult, DocumentStoreError> {
    let content = fs::read_to_string(&file.absolute_path)?;
    let (parsed_metadata, markdown) = parse_frontmatter(&content);

    let now = now_iso_string_utc();
    let parsed_id = parsed_metadata
        .id
        .and_then(|value| normalize_document_id(&value));
    let fallback_id = fallback_id.and_then(normalize_document_id);
    let final_id = parsed_id
        .clone()
        .or(fallback_id)
        .unwrap_or_else(generate_document_id);

    let (created_at, used_created_fallback) =
        resolve_timestamp_value(parsed_metadata.created_at.as_deref(), &now);
    let (updated_at, used_updated_fallback) =
        resolve_timestamp_value(parsed_metadata.updated_at.as_deref(), &created_at);

    let metadata = MarkdownFrontmatter {
        id: final_id,
        created_at,
        updated_at,
        tags: normalize_tags(parsed_metadata.tags.iter().map(|tag| tag.as_str())),
        tags_locked: parsed_metadata.tags_locked.unwrap_or(false),
    };

    let record = StoredDocumentRecord {
        metadata,
        title: file.title_from_file_name.clone(),
        body: extract_markdown_body(&markdown, &file.title_from_file_name),
    };

    Ok(StoredDocumentReadResult {
        record,
        rewrite_metadata: parsed_id.is_none() || used_created_fallback || used_updated_fallback,
    })
}

fn resolve_timestamp_value(value: Option<&str>, fallback: &str) -> (String, bool) {
    let Some(raw) = value else {
        return (fallback.to_owned(), true);
    };

    let normalized = raw.trim();
    if normalized.is_empty() || !is_valid_iso8601_like_timestamp(normalized) {
        return (fallback.to_owned(), true);
    }

    (normalized.to_owned(), false)
}

fn parse_frontmatter_id(content: &str) -> Option<String> {
    let (metadata, _) = parse_frontmatter(content);
    metadata.id.and_then(|value| normalize_document_id(&value))
}

fn parse_frontmatter(content: &str) -> (ParsedFrontmatterMetadata, String) {
    let normalized = normalize_line_endings(content);
    if !normalized.starts_with("---\n") {
        return (ParsedFrontmatterMetadata::default(), normalized);
    }

    let Some(end_index) = normalized[4..].find("\n---\n").map(|idx| idx + 4) else {
        return (ParsedFrontmatterMetadata::default(), normalized);
    };

    let raw_frontmatter = &normalized[4..end_index];
    let markdown = normalized[end_index + 5..].to_owned();

    let mut metadata = ParsedFrontmatterMetadata::default();
    for line in raw_frontmatter.lines() {
        let Some(separator_index) = line.find(':') else {
            continue;
        };

        let key = line[..separator_index].trim();
        let raw_value = line[separator_index + 1..].trim();
        let unquoted_value = if raw_value == "null" {
            None
        } else {
            Some(unquote_yaml_value(raw_value))
        };

        match key {
            "id" => {
                if let Some(value) = unquoted_value {
                    metadata.id = Some(value);
                }
            }
            "created_at" => {
                if let Some(value) = unquoted_value {
                    metadata.created_at = Some(value);
                }
            }
            "updated_at" => {
                if let Some(value) = unquoted_value {
                    metadata.updated_at = Some(value);
                }
            }
            "tags" => {
                metadata.tags = parse_tags_frontmatter_value(raw_value);
            }
            "tags_locked" => {
                metadata.tags_locked = Some(matches!(unquoted_value.as_deref(), Some("true")));
            }
            _ => {}
        }
    }

    (metadata, markdown)
}

fn parse_tags_frontmatter_value(raw_value: &str) -> Vec<String> {
    normalize_tags(parse_inline_array(raw_value).iter().map(|tag| tag.as_str()))
}

fn parse_inline_array(raw_value: &str) -> Vec<String> {
    let trimmed = raw_value.trim();
    if !trimmed.starts_with('[') || !trimmed.ends_with(']') {
        return Vec::new();
    }

    if let Ok(parsed_json) = serde_json::from_str::<serde_json::Value>(trimmed) {
        if let serde_json::Value::Array(values) = parsed_json {
            return values
                .into_iter()
                .filter_map(|value| value.as_str().map(|part| part.to_owned()))
                .collect();
        }
    }

    let inner = trimmed[1..trimmed.len().saturating_sub(1)].trim();
    if inner.is_empty() {
        return Vec::new();
    }

    inner
        .split(',')
        .map(|token| {
            let part = token.trim();
            if part.len() >= 2
                && ((part.starts_with('"') && part.ends_with('"'))
                    || (part.starts_with('\'') && part.ends_with('\'')))
            {
                part[1..part.len().saturating_sub(1)]
                    .replace("\\\"", "\"")
                    .replace("\\'", "'")
                    .replace("\\\\", "\\")
            } else {
                part.to_owned()
            }
        })
        .collect()
}

fn extract_markdown_body(markdown: &str, file_name_title: &str) -> String {
    let normalized = normalize_line_endings(markdown);
    let lines: Vec<&str> = normalized.split('\n').collect();

    let normalized_file_title = normalize_title(Some(file_name_title)).to_lowercase();
    let mut index = 0usize;
    while index < lines.len() && lines[index].trim().is_empty() {
        index += 1;
    }

    if index < lines.len() {
        if let Some(heading_title) = parse_title_heading(lines[index]) {
            let normalized_heading_title = normalize_title(Some(heading_title)).to_lowercase();
            if normalized_heading_title == normalized_file_title {
                let mut body_index = index + 1;
                while body_index < lines.len() && lines[body_index].trim().is_empty() {
                    body_index += 1;
                }
                return lines[body_index..].join("\n").trim().to_owned();
            }
        }
    }

    normalized.trim().to_owned()
}

fn parse_title_heading(line: &str) -> Option<&str> {
    if !line.starts_with('#') || line.starts_with("##") {
        return None;
    }

    let rest = &line[1..];
    let mut chars = rest.chars();
    let first = chars.next()?;
    if !first.is_whitespace() {
        return None;
    }

    let title = rest.trim_start();
    if title.is_empty() {
        return None;
    }

    Some(title)
}

fn write_stored_document_to_file(
    path: &Path,
    record: &StoredDocumentRecord,
) -> Result<(), DocumentStoreError> {
    let content = build_markdown_file(record);
    fs::write(path, content)?;
    Ok(())
}

fn write_stored_document_new_file(
    path: &Path,
    record: &StoredDocumentRecord,
) -> Result<(), DocumentStoreError> {
    let content = build_markdown_file(record);
    let mut file = OpenOptions::new().write(true).create_new(true).open(path)?;
    file.write_all(content.as_bytes())?;
    Ok(())
}

fn build_markdown_file(record: &StoredDocumentRecord) -> String {
    let frontmatter = serialize_frontmatter(&record.metadata);
    let heading = format!("# {}", sanitize_title_for_heading(&record.title));
    let body = normalize_line_endings(&record.body).trim().to_owned();
    let markdown_body = if body.is_empty() {
        format!("{heading}\n")
    } else {
        format!("{heading}\n\n{body}")
    };
    format!("{frontmatter}{markdown_body}")
}

fn serialize_frontmatter(metadata: &MarkdownFrontmatter) -> String {
    let tags = serde_json::to_string(&normalize_tags(
        metadata.tags.iter().map(|tag| tag.as_str()),
    ))
    .unwrap_or_else(|_| "[]".to_owned());

    [
        "---".to_owned(),
        format!("id: \"{}\"", escape_yaml_string(&metadata.id)),
        format!(
            "created_at: \"{}\"",
            escape_yaml_string(&metadata.created_at)
        ),
        format!(
            "updated_at: \"{}\"",
            escape_yaml_string(&metadata.updated_at)
        ),
        format!("tags: {tags}"),
        format!(
            "tags_locked: {}",
            if metadata.tags_locked {
                "true"
            } else {
                "false"
            }
        ),
        "---".to_owned(),
        String::new(),
    ]
    .join("\n")
}

fn escape_yaml_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

fn unquote_yaml_value(value: &str) -> String {
    if value.starts_with('"') && value.ends_with('"') && value.len() >= 2 {
        return value[1..value.len() - 1]
            .replace("\\\"", "\"")
            .replace("\\\\", "\\");
    }
    value.to_owned()
}

fn sanitize_title_for_heading(title: &str) -> String {
    let normalized = normalize_title(Some(title));
    let mut remainder = normalized.as_str();
    let mut had_heading_marker = false;
    while let Some(stripped) = remainder.strip_prefix('#') {
        had_heading_marker = true;
        remainder = stripped;
    }
    if had_heading_marker {
        remainder = remainder.trim_start();
    }
    remainder.to_owned()
}

fn sanitize_title_for_file_name(title: Option<&str>) -> String {
    let normalized = normalize_title(title);

    let mut sanitized = String::with_capacity(normalized.len());
    for character in normalized.chars() {
        if character.is_control() {
            sanitized.push(' ');
            continue;
        }

        if matches!(
            character,
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
        ) {
            sanitized.push(' ');
            continue;
        }

        sanitized.push(character);
    }

    let collapsed = collapse_whitespace(&sanitized);
    let trimmed = collapsed.trim_end_matches(['.', ' ']).trim().to_owned();
    let fallback = if trimmed.is_empty() {
        DEFAULT_TITLE.to_owned()
    } else {
        trimmed
    };

    let reserved_stem = fallback
        .split('.')
        .next()
        .unwrap_or(&fallback)
        .to_uppercase();
    if matches!(
        reserved_stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    ) {
        return format!("{fallback} (1)");
    }

    fallback
}

fn resolve_unique_title(
    documents_folder: &Path,
    target_folder_path: &str,
    base_title: &str,
) -> Result<String, DocumentStoreError> {
    let files = list_stored_markdown_files(documents_folder)?;
    let target_folder_key = target_folder_path.to_lowercase();

    let occupied_names: HashSet<String> = files
        .into_iter()
        .filter(|file| file.relative_folder_path.to_lowercase() == target_folder_key)
        .map(|file| file.name.to_lowercase())
        .collect();

    let mut candidate = base_title.to_owned();
    let mut counter: usize = 2;
    while occupied_names.contains(&format!("{candidate}{MARKDOWN_EXTENSION}").to_lowercase()) {
        candidate = format!("{base_title} ({counter})");
        counter += 1;
    }
    Ok(candidate)
}

fn normalize_title(title: Option<&str>) -> String {
    let normalized = normalize_line_endings(title.unwrap_or_default()).replace('\n', " ");
    let trimmed = normalized.trim();
    if trimmed.is_empty() {
        return DEFAULT_TITLE.to_owned();
    }
    trimmed.to_owned()
}

fn normalize_line_endings(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

fn normalize_tags<'a>(tags: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    let mut normalized_tags = Vec::new();
    let mut seen = HashSet::new();

    for tag in tags {
        let sanitized = sanitize_tag(tag);
        if sanitized.is_empty() || seen.contains(&sanitized) {
            continue;
        }
        seen.insert(sanitized.clone());
        normalized_tags.push(sanitized);
    }

    normalized_tags
}

fn sanitize_tag(raw_tag: &str) -> String {
    let mut sanitized = String::with_capacity(raw_tag.len());
    for character in raw_tag.chars() {
        if character.is_control() {
            sanitized.push(' ');
            continue;
        }
        sanitized.push(character);
    }

    let without_prefix = sanitized.trim_start_matches('#');
    let trimmed = without_prefix.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    collapse_whitespace(trimmed)
        .replace(' ', "_")
        .to_lowercase()
}

fn collapse_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
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

fn generate_unique_document_id(used_ids: &HashSet<String>) -> String {
    loop {
        let candidate = generate_document_id();
        if !used_ids.contains(&candidate) {
            return candidate;
        }
    }
}

fn generate_document_id() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let counter = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{:x}{:x}", duration.as_nanos(), counter)
}

fn now_iso_string_utc() -> String {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let seconds = duration.as_secs() as i64;
    format_unix_seconds_utc(seconds)
}

fn format_unix_seconds_utc(seconds_since_epoch: i64) -> String {
    let days_since_epoch = seconds_since_epoch.div_euclid(86_400);
    let seconds_within_day = seconds_since_epoch.rem_euclid(86_400);

    let (year, month, day) = civil_from_days(days_since_epoch);
    let hour = seconds_within_day / 3_600;
    let minute = (seconds_within_day % 3_600) / 60;
    let second = seconds_within_day % 60;

    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

fn civil_from_days(days_since_unix_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_unix_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    if month <= 2 {
        year += 1;
    }
    (year, month, day)
}

fn is_valid_iso8601_like_timestamp(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() < 19 {
        return false;
    }

    if !is_digits(bytes, 0, 4)
        || bytes[4] != b'-'
        || !is_digits(bytes, 5, 2)
        || bytes[7] != b'-'
        || !is_digits(bytes, 8, 2)
        || !(bytes[10] == b'T' || bytes[10] == b't' || bytes[10] == b' ')
        || !is_digits(bytes, 11, 2)
        || bytes[13] != b':'
        || !is_digits(bytes, 14, 2)
        || bytes[16] != b':'
        || !is_digits(bytes, 17, 2)
    {
        return false;
    }

    let year = parse_i32(bytes, 0, 4);
    let month = parse_i32(bytes, 5, 2);
    let day = parse_i32(bytes, 8, 2);
    let hour = parse_i32(bytes, 11, 2);
    let minute = parse_i32(bytes, 14, 2);
    let second = parse_i32(bytes, 17, 2);

    if year.is_none()
        || month.is_none()
        || day.is_none()
        || hour.is_none()
        || minute.is_none()
        || second.is_none()
    {
        return false;
    }

    let month = month.unwrap_or_default();
    let day = day.unwrap_or_default();
    let hour = hour.unwrap_or_default();
    let minute = minute.unwrap_or_default();
    let second = second.unwrap_or_default();

    if !(1..=12).contains(&month)
        || !(0..=23).contains(&hour)
        || !(0..=59).contains(&minute)
        || !(0..=59).contains(&second)
    {
        return false;
    }

    let max_day = days_in_month(year.unwrap_or_default(), month);
    if !(1..=max_day).contains(&day) {
        return false;
    }

    let mut index = 19usize;
    if index < bytes.len() && bytes[index] == b'.' {
        index += 1;
        let fraction_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if index == fraction_start {
            return false;
        }
    }

    if index == bytes.len() {
        return true;
    }

    if bytes[index] == b'Z' || bytes[index] == b'z' {
        return index + 1 == bytes.len();
    }

    if bytes[index] != b'+' && bytes[index] != b'-' {
        return false;
    }
    if index + 6 != bytes.len() {
        return false;
    }
    if !is_digits(bytes, index + 1, 2)
        || bytes[index + 3] != b':'
        || !is_digits(bytes, index + 4, 2)
    {
        return false;
    }

    let offset_hours = parse_i32(bytes, index + 1, 2).unwrap_or_default();
    let offset_minutes = parse_i32(bytes, index + 4, 2).unwrap_or_default();
    (0..=23).contains(&offset_hours) && (0..=59).contains(&offset_minutes)
}

fn is_digits(bytes: &[u8], start: usize, len: usize) -> bool {
    let end = start.saturating_add(len);
    if end > bytes.len() {
        return false;
    }
    bytes[start..end].iter().all(|value| value.is_ascii_digit())
}

fn parse_i32(bytes: &[u8], start: usize, len: usize) -> Option<i64> {
    if !is_digits(bytes, start, len) {
        return None;
    }
    let part = std::str::from_utf8(&bytes[start..start + len]).ok()?;
    part.parse::<i64>().ok()
}

fn is_leap_year(year: i64) -> bool {
    (year % 4 == 0 && year % 100 != 0) || year % 400 == 0
}

fn days_in_month(year: i64, month: i64) -> i64 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

fn normalize_folder_path(raw_path: &str) -> Result<String, DocumentStoreError> {
    normalize_relative_path(raw_path)
}

fn normalize_relative_path(raw_path: &str) -> Result<String, DocumentStoreError> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Ok(String::new());
    }

    let normalized_separators = trimmed.replace('\\', "/");
    if normalized_separators.starts_with('/') || is_windows_drive_path(&normalized_separators) {
        return Err(DocumentStoreError::Validation(
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
            return Err(DocumentStoreError::Validation(
                "path traversal segments are not allowed".to_owned(),
            ));
        }
        normalized_parts.push(segment.to_owned());
    }

    Ok(normalized_parts.join("/"))
}

fn reject_reserved_folder_path(path: &str) -> Result<(), DocumentStoreError> {
    if path
        .split('/')
        .any(|segment| !segment.is_empty() && segment == RESERVED_TRASH_FOLDER)
    {
        return Err(DocumentStoreError::Validation(format!(
            "folder path segment \"{RESERVED_TRASH_FOLDER}\" is reserved"
        )));
    }
    Ok(())
}

fn is_windows_drive_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    if bytes.len() < 2 {
        return false;
    }
    bytes[0].is_ascii_alphabetic() && bytes[1] == b':'
}

fn folder_absolute_path(documents_folder: &Path, relative_path: &str) -> PathBuf {
    if relative_path.is_empty() {
        return documents_folder.to_path_buf();
    }

    let mut result = documents_folder.to_path_buf();
    for segment in relative_path.split('/') {
        if segment.is_empty() {
            continue;
        }
        result.push(segment);
    }
    result
}

fn ensure_within_documents_folder(
    documents_folder: &Path,
    candidate_path: &Path,
) -> Result<(), DocumentStoreError> {
    if !candidate_path.starts_with(documents_folder) {
        return Err(DocumentStoreError::Validation(
            "path escapes documents folder".to_owned(),
        ));
    }
    Ok(())
}

fn join_relative_path(prefix: &str, name: &str) -> String {
    if prefix.is_empty() {
        return name.to_owned();
    }
    format!("{prefix}/{name}")
}

fn is_markdown_file_name(name: &str) -> bool {
    name.to_ascii_lowercase().ends_with(MARKDOWN_EXTENSION)
}

fn remove_markdown_extension(name: &str) -> &str {
    if is_markdown_file_name(name) {
        let length = name.len().saturating_sub(MARKDOWN_EXTENSION.len());
        &name[..length]
    } else {
        name
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_path(prefix: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        let thread_id = format!("{:?}", std::thread::current().id())
            .chars()
            .filter(|character| character.is_ascii_alphanumeric())
            .collect::<String>();
        std::env::temp_dir().join(format!("{prefix}-{timestamp}-{thread_id}"))
    }

    fn write_markdown(path: &Path, raw_frontmatter: &str, title: &str, body: &str) {
        let content = format!("{raw_frontmatter}# {title}\n\n{body}\n");
        fs::write(path, content).expect("markdown file should be written");
    }

    fn write_standard_markdown(path: &Path, id: Option<&str>, title: &str, tags: &str) {
        let id_line = id
            .map(|value| format!("id: \"{value}\""))
            .unwrap_or_else(|| "id: null".to_owned());
        let frontmatter = format!(
            "---\n{id_line}\ncreated_at: \"2026-02-16T00:00:00Z\"\nupdated_at: \"2026-02-16T00:00:00Z\"\ntags: {tags}\ntags_locked: false\n---\n\n"
        );
        write_markdown(path, &frontmatter, title, "Body");
    }

    #[test]
    fn recovers_malformed_frontmatter_when_reading_document() {
        let temp_dir = unique_temp_path("tentacle-document-store-recovery");
        fs::create_dir_all(&temp_dir).expect("create temp directory");

        let file_path = temp_dir.join("Malformed.md");
        let frontmatter = "---\nid: null\ncreated_at: \"invalid\"\nupdated_at: \"\"\ntags: [\"#Alpha\", \"alpha\", \"two words\"]\ntags_locked: true\n---\n\n";
        write_markdown(&file_path, frontmatter, "Malformed", "Recovered body");

        let recovered = read_document(&temp_dir, "Malformed").expect("read malformed document");
        assert_eq!(recovered.id, "Malformed");
        assert_eq!(recovered.title, "Malformed");
        assert_eq!(recovered.body, "Recovered body");
        assert_eq!(recovered.tags, vec!["alpha", "two_words"]);
        assert!(recovered.tags_locked);
        assert!(is_valid_iso8601_like_timestamp(&recovered.created_at));
        assert!(is_valid_iso8601_like_timestamp(&recovered.updated_at));

        let rewritten = fs::read_to_string(&file_path).expect("read rewritten file");
        assert!(rewritten.contains("id: \"Malformed\""));
        assert!(rewritten.contains("tags: [\"alpha\",\"two_words\"]"));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn finds_document_by_frontmatter_id_with_filename_fallback() {
        let temp_dir = unique_temp_path("tentacle-document-store-find");
        fs::create_dir_all(&temp_dir).expect("create temp directory");

        write_standard_markdown(&temp_dir.join("alpha.md"), None, "alpha", "[\"fallback\"]");
        write_standard_markdown(
            &temp_dir.join("zeta.md"),
            Some("lookup-id"),
            "zeta",
            "[\"primary\"]",
        );

        let found_primary =
            find_document_by_id(&temp_dir, "lookup-id").expect("lookup by frontmatter id");
        assert!(found_primary.is_some());
        let found_primary = found_primary.expect("primary result should exist");
        assert_eq!(found_primary.id, "lookup-id");
        assert_eq!(found_primary.title, "zeta");
        assert_eq!(found_primary.tags, vec!["primary"]);

        let found_fallback =
            find_document_by_id(&temp_dir, "alpha").expect("lookup by fallback file name");
        assert!(found_fallback.is_some());
        let found_fallback = found_fallback.expect("fallback result should exist");
        assert_eq!(found_fallback.id, "alpha");
        assert_eq!(found_fallback.title, "alpha");
        assert_eq!(found_fallback.tags, vec!["fallback"]);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn normalizes_and_deduplicates_tags_on_create_and_update() {
        let temp_dir = unique_temp_path("tentacle-document-store-tags");
        fs::create_dir_all(&temp_dir).expect("create temp directory");

        let created = create_document(
            &temp_dir,
            &CreateDocumentInput {
                title: Some("Tag Doc".to_owned()),
                body: Some("Body".to_owned()),
                folder_path: None,
                tags: vec![
                    "#Alpha".to_owned(),
                    "alpha".to_owned(),
                    "Two Words".to_owned(),
                    "two   words".to_owned(),
                    "".to_owned(),
                ],
                tags_locked: Some(false),
                id: Some("tag-doc".to_owned()),
            },
        )
        .expect("create document");
        assert_eq!(created.tags, vec!["alpha", "two_words"]);

        let added = update_document_tags(
            &temp_dir,
            &created.id,
            &[
                "#ALPHA".to_owned(),
                "New\nTag".to_owned(),
                "new tag".to_owned(),
            ],
            TagUpdateMode::Add,
        )
        .expect("add tags");
        assert_eq!(added.tags, vec!["alpha", "two_words", "new_tag"]);

        let removed = update_document_tags(
            &temp_dir,
            &created.id,
            &["#alpha".to_owned()],
            TagUpdateMode::Remove,
        )
        .expect("remove tags");
        assert_eq!(removed.tags, vec!["two_words", "new_tag"]);

        let replaced = update_document_tags(
            &temp_dir,
            &created.id,
            &[
                " Another Tag ".to_owned(),
                "another_tag".to_owned(),
                "".to_owned(),
            ],
            TagUpdateMode::Replace,
        )
        .expect("replace tags");
        assert_eq!(replaced.tags, vec!["another_tag"]);

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn discovers_nested_documents_and_excludes_trash_subtrees() {
        let temp_dir = unique_temp_path("tentacle-document-store-discovery");
        fs::create_dir_all(temp_dir.join("work/sub")).expect("create nested directories");
        fs::create_dir_all(temp_dir.join(".trash/old")).expect("create root trash directory");
        fs::create_dir_all(temp_dir.join("work/.trash/hidden"))
            .expect("create nested trash directory");

        write_standard_markdown(
            &temp_dir.join("root.md"),
            Some("root-id"),
            "root",
            "[\"root\"]",
        );
        write_standard_markdown(
            &temp_dir.join("work/one.md"),
            Some("work-one"),
            "one",
            "[\"work\"]",
        );
        write_standard_markdown(
            &temp_dir.join("work/sub/two.md"),
            Some("work-two"),
            "two",
            "[\"sub\"]",
        );
        write_standard_markdown(
            &temp_dir.join(".trash/old/deleted.md"),
            Some("trash-root"),
            "deleted",
            "[\"trash\"]",
        );
        write_standard_markdown(
            &temp_dir.join("work/.trash/hidden/deleted.md"),
            Some("trash-nested"),
            "deleted",
            "[\"trash\"]",
        );

        let listed = list_documents(&temp_dir).expect("list documents");
        let ids: HashSet<String> = listed.iter().map(|item| item.id.clone()).collect();
        assert_eq!(listed.len(), 3);
        assert!(ids.contains("root-id"));
        assert!(ids.contains("work-one"));
        assert!(ids.contains("work-two"));
        assert!(!ids.contains("trash-root"));
        assert!(!ids.contains("trash-nested"));

        let by_id: std::collections::HashMap<String, String> = listed
            .into_iter()
            .map(|item| (item.id, item.folder_path))
            .collect();
        assert_eq!(by_id.get("root-id"), Some(&"".to_owned()));
        assert_eq!(by_id.get("work-one"), Some(&"work".to_owned()));
        assert_eq!(by_id.get("work-two"), Some(&"work/sub".to_owned()));

        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn finds_document_by_prefix_match() {
        let temp_dir = unique_temp_path("tentacle-document-store-prefix");
        fs::create_dir_all(&temp_dir).expect("create temp directory");

        // Create documents with known IDs
        let _doc1 = create_document(
            &temp_dir,
            &CreateDocumentInput {
                title: Some("First Doc".to_owned()),
                body: Some("First content".to_owned()),
                folder_path: None,
                tags: vec![],
                tags_locked: Some(false),
                id: Some("abc123456".to_owned()),
            },
        )
        .expect("create first document");

        let _doc2 = create_document(
            &temp_dir,
            &CreateDocumentInput {
                title: Some("Second Doc".to_owned()),
                body: Some("Second content".to_owned()),
                folder_path: None,
                tags: vec![],
                tags_locked: Some(false),
                id: Some("abc789def".to_owned()),
            },
        )
        .expect("create second document");

        // Exact match should work
        let exact = read_document(&temp_dir, "abc123456").expect("read by exact ID");
        assert_eq!(exact.id, "abc123456");
        assert_eq!(exact.title, "First Doc");

        // Unique prefix should work
        let prefix1 = read_document(&temp_dir, "abc12").expect("read by unique prefix");
        assert_eq!(prefix1.id, "abc123456");
        assert_eq!(prefix1.title, "First Doc");

        let prefix2 = read_document(&temp_dir, "abc78").expect("read by unique prefix");
        assert_eq!(prefix2.id, "abc789def");
        assert_eq!(prefix2.title, "Second Doc");

        // Ambiguous prefix should fail
        let ambiguous = read_document(&temp_dir, "abc");
        assert!(ambiguous.is_err());
        match ambiguous {
            Err(DocumentStoreError::Validation(msg)) => {
                assert!(msg.contains("ambiguous"));
                assert!(msg.contains("2 documents"));
            }
            _ => panic!("expected validation error for ambiguous prefix"),
        }

        // Non-matching prefix should fail
        let not_found = read_document(&temp_dir, "xyz");
        assert!(not_found.is_err());
        match not_found {
            Err(DocumentStoreError::NotFound(_)) => {}
            _ => panic!("expected not found error for non-matching prefix"),
        }

        let _ = fs::remove_dir_all(temp_dir);
    }
}
