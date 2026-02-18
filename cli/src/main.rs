mod cli;
mod errors;
mod output;

use clap::Parser;
use serde::Serialize;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Instant;
use tentacle_core::config::{default_data_dir, ConfigError, ConfigStore, KEY_DOCUMENTS_FOLDER};
use tentacle_core::document_cache::{DocumentCacheError, DocumentCacheStore};
use tentacle_core::document_folders::DocumentFoldersError;
use tentacle_core::document_store::{
    self, DocumentStoreError, StoredDocument, StoredDocumentListItem,
};
use tentacle_core::knowledge_base::{KnowledgeBaseError, KnowledgeBaseService, SearchOptions};

use crate::cli::{
    Cli, Commands, ConfigCommands, FolderCommands, ListArgs, ListSort, ReadArgs, ReindexArgs,
    SearchArgs,
};
use crate::errors::{clap_exit_code, exit_code_for, summarize_clap_error, CliError};

const KEY_EDITOR: &str = "editor";
const KEY_DEFAULT_FOLDER: &str = "default_folder";
const KEY_AUTO_TAG: &str = "auto_tag";

const DEFAULT_EDITOR: &str = "vi";
const DEFAULT_FOLDER: &str = "inbox";
const DEFAULT_AUTO_TAG: bool = true;
const DEFAULT_DOCUMENTS_FOLDER_VALUE: &str = "~/Tentacle";

fn main() -> ExitCode {
    let json_requested = std::env::args().skip(1).any(|arg| arg == "--json");

    let cli = match Cli::try_parse() {
        Ok(parsed) => parsed,
        Err(error) => {
            let kind = error.kind();
            let code = clap_exit_code(kind);

            match kind {
                clap::error::ErrorKind::DisplayHelp | clap::error::ErrorKind::DisplayVersion => {
                    let _ = error.print();
                }
                _ if json_requested => {
                    let cli_error = CliError::invalid_arguments(summarize_clap_error(&error));
                    output::print_error(&cli_error, true);
                }
                _ => {
                    let _ = error.print();
                }
            }

            return ExitCode::from(code);
        }
    };

    match run(&cli) {
        Ok(()) => ExitCode::from(exit_code_for(None)),
        Err(error) => {
            output::print_error(&error, cli.json);
            ExitCode::from(error.exit_code())
        }
    }
}

fn run(cli: &Cli) -> Result<(), CliError> {
    match &cli.command {
        Commands::Init => handle_init(cli.json),
        Commands::Config { command } => handle_config(command.as_ref(), cli.json),
        Commands::Status => handle_status(cli.json),
        Commands::Reindex(args) => handle_reindex(args, cli.json),
        Commands::List(args) => handle_list(args, cli.json),
        Commands::Search(args) => handle_search(args, cli.json),
        Commands::Read(args) => handle_read(args, cli.json),

        Commands::Create(_) => {
            output::print_scaffold_success("create", cli.json);
            Ok(())
        }
        Commands::Tag(_) => {
            output::print_scaffold_success("tag", cli.json);
            Ok(())
        }

        Commands::Folder { command } => match command {
            FolderCommands::List => {
                output::print_scaffold_success("folder list", cli.json);
                Ok(())
            }
            FolderCommands::Create { .. } => {
                output::print_scaffold_success("folder create", cli.json);
                Ok(())
            }
            FolderCommands::Delete { .. } => {
                output::print_scaffold_success("folder delete", cli.json);
                Ok(())
            }
            FolderCommands::Rename { .. } => {
                output::print_scaffold_success("folder rename", cli.json);
                Ok(())
            }
        },

        Commands::Edit(_) => Err(CliError::not_implemented("edit")),
        Commands::Import(_) => Err(CliError::not_implemented("import")),
        Commands::Export(_) => Err(CliError::not_implemented("export")),
        Commands::Delete(_) => Err(CliError::not_implemented("delete")),
    }
}

#[derive(Debug, Clone, Copy)]
enum ConfigKey {
    DocumentsFolder,
    Editor,
    DefaultFolder,
    AutoTag,
}

impl ConfigKey {
    fn parse(raw_key: &str) -> Result<Self, CliError> {
        match raw_key.trim() {
            "documents_folder" | "storage_path" => Ok(Self::DocumentsFolder),
            "editor" => Ok(Self::Editor),
            "default_folder" => Ok(Self::DefaultFolder),
            "auto_tag" => Ok(Self::AutoTag),
            _ => Err(CliError::invalid_arguments(format!(
                "unsupported config key \"{raw_key}\"; supported keys: documents_folder, editor, default_folder, auto_tag"
            ))),
        }
    }

    const fn store_key(self) -> &'static str {
        match self {
            Self::DocumentsFolder => KEY_DOCUMENTS_FOLDER,
            Self::Editor => KEY_EDITOR,
            Self::DefaultFolder => KEY_DEFAULT_FOLDER,
            Self::AutoTag => KEY_AUTO_TAG,
        }
    }

    const fn canonical_name(self) -> &'static str {
        match self {
            Self::DocumentsFolder => "documents_folder",
            Self::Editor => "editor",
            Self::DefaultFolder => "default_folder",
            Self::AutoTag => "auto_tag",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
enum ConfigValuePayload {
    Text(String),
    Bool(bool),
}

#[derive(Debug, Serialize)]
struct InitResponsePayload {
    status: &'static str,
    config_path: String,
    data_path: String,
    documents_folder: String,
}

#[derive(Debug, Serialize)]
struct ConfigViewPayload {
    documents_folder: String,
    editor: String,
    default_folder: String,
    auto_tag: bool,
}

#[derive(Debug, Serialize)]
struct ConfigGetPayload {
    key: String,
    value: ConfigValuePayload,
}

#[derive(Debug, Serialize)]
struct ConfigSetPayload {
    status: &'static str,
    key: String,
    value: ConfigValuePayload,
}

#[derive(Debug, Serialize)]
struct ReindexResponsePayload {
    status: &'static str,
    documents_indexed: usize,
    embeddings_synced: usize,
    embeddings_failed: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    folder_filter: Option<String>,
    duration_ms: u64,
}

#[derive(Debug, Serialize)]
struct ListDocumentPayload {
    id: String,
    title: String,
    folder: String,
    tags: Vec<String>,
    created_at: String,
    modified_at: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
struct ListResponsePayload {
    documents: Vec<ListDocumentPayload>,
    total: usize,
    showing: usize,
}

#[derive(Debug, Serialize)]
struct SearchResultPayload {
    id: String,
    title: String,
    relevance_score: f32,
    folder: String,
    tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    snippet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    matched_chunks: Option<usize>,
}

#[derive(Debug, Serialize)]
struct SearchResponsePayload {
    query: String,
    results: Vec<SearchResultPayload>,
    total_results: usize,
    search_time_ms: u64,
}

#[derive(Debug, Serialize)]
struct ReadResponsePayload {
    id: String,
    title: String,
    folder: String,
    tags: Vec<String>,
    created_at: String,
    modified_at: String,
    content: String,
    size_bytes: u64,
}

fn handle_init(json: bool) -> Result<(), CliError> {
    let app_data_dir = resolve_app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir).map_err(map_io_error)?;

    let config_store = ConfigStore::new(&app_data_dir).map_err(map_config_error)?;
    let documents_folder_config_value = match config_store
        .get(KEY_DOCUMENTS_FOLDER)
        .map_err(map_config_error)?
    {
        Some(value) if !value.trim().is_empty() => value,
        _ => {
            let default_value = DEFAULT_DOCUMENTS_FOLDER_VALUE.to_owned();
            config_store
                .set(KEY_DOCUMENTS_FOLDER, &default_value)
                .map_err(map_config_error)?;
            default_value
        }
    };

    let documents_folder_path = resolve_documents_folder_path(&documents_folder_config_value)?;
    DocumentCacheStore::new(&documents_folder_path).map_err(map_document_cache_error)?;

    let payload = InitResponsePayload {
        status: "initialized",
        config_path: app_data_dir
            .join("config.db")
            .to_string_lossy()
            .into_owned(),
        data_path: app_data_dir.to_string_lossy().into_owned(),
        documents_folder: documents_folder_path.to_string_lossy().into_owned(),
    };

    if json {
        print_json(&payload)
    } else {
        println!("Tentacle initialized.");
        println!("Config: {}", payload.config_path);
        println!("Data: {}", payload.data_path);
        println!("Documents: {}", payload.documents_folder);
        Ok(())
    }
}

fn handle_config(command: Option<&ConfigCommands>, json: bool) -> Result<(), CliError> {
    match command {
        None => handle_config_view(json),
        Some(ConfigCommands::Get { key }) => handle_config_get(key, json),
        Some(ConfigCommands::Set { key, value }) => handle_config_set(key, value, json),
    }
}

fn handle_config_view(json: bool) -> Result<(), CliError> {
    let store = open_config_store()?;
    let payload = ConfigViewPayload {
        documents_folder: get_config_text_or_default(&store, ConfigKey::DocumentsFolder)?,
        editor: get_config_text_or_default(&store, ConfigKey::Editor)?,
        default_folder: get_config_text_or_default(&store, ConfigKey::DefaultFolder)?,
        auto_tag: get_config_bool_or_default(&store, ConfigKey::AutoTag)?,
    };

    if json {
        print_json(&payload)
    } else {
        println!("documents_folder = {}", payload.documents_folder);
        println!("editor = {}", payload.editor);
        println!("default_folder = {}", payload.default_folder);
        println!("auto_tag = {}", payload.auto_tag);
        Ok(())
    }
}

fn handle_config_get(key: &str, json: bool) -> Result<(), CliError> {
    let config_key = ConfigKey::parse(key)?;
    let store = open_config_store()?;
    let value = get_config_value(&store, config_key)?;

    if json {
        let payload = ConfigGetPayload {
            key: config_key.canonical_name().to_owned(),
            value,
        };
        return print_json(&payload);
    }

    match value {
        ConfigValuePayload::Text(value) => println!("{value}"),
        ConfigValuePayload::Bool(value) => println!("{value}"),
    }

    Ok(())
}

fn handle_config_set(key: &str, value: &str, json: bool) -> Result<(), CliError> {
    let config_key = ConfigKey::parse(key)?;
    let mut normalized_value = value.trim().to_owned();
    if normalized_value.is_empty() {
        return Err(CliError::invalid_arguments(format!(
            "value for \"{}\" must not be empty",
            config_key.canonical_name()
        )));
    }

    let config_store = open_config_store()?;
    let response_value = match config_key {
        ConfigKey::AutoTag => {
            let parsed = parse_bool(&normalized_value).ok_or_else(|| {
                CliError::invalid_arguments(
                    "auto_tag must be one of: true, false, 1, 0, yes, no, on, off",
                )
            })?;
            normalized_value = parsed.to_string();
            ConfigValuePayload::Bool(parsed)
        }
        ConfigKey::DocumentsFolder => {
            let resolved_path = resolve_documents_folder_path(&normalized_value)?;
            DocumentCacheStore::new(&resolved_path).map_err(map_document_cache_error)?;
            ConfigValuePayload::Text(normalized_value.clone())
        }
        ConfigKey::Editor | ConfigKey::DefaultFolder => {
            ConfigValuePayload::Text(normalized_value.clone())
        }
    };

    config_store
        .set(config_key.store_key(), &normalized_value)
        .map_err(map_config_error)?;

    if json {
        let payload = ConfigSetPayload {
            status: "updated",
            key: config_key.canonical_name().to_owned(),
            value: response_value,
        };
        return print_json(&payload);
    }

    println!("{} = {}", config_key.canonical_name(), normalized_value);
    Ok(())
}

fn handle_status(json: bool) -> Result<(), CliError> {
    let documents_folder = load_documents_folder()?;
    let payload =
        KnowledgeBaseService::status(&documents_folder).map_err(map_knowledge_base_error)?;

    if json {
        return print_json(&payload);
    }

    println!("Documents:    {}", payload.documents.total);
    println!("Folders:      {}", payload.folders);
    println!("Tags:         {}", payload.tags);
    println!(
        "Last Indexed: {}",
        payload.last_indexed.as_deref().unwrap_or("never")
    );
    println!("Index Size:   {}", format_bytes(payload.index_size_bytes));

    Ok(())
}

fn handle_reindex(args: &ReindexArgs, json: bool) -> Result<(), CliError> {
    let documents_folder = load_documents_folder()?;
    let folder_filter = normalize_folder_filter(args.folder.as_deref())?;
    let started = Instant::now();
    let result = KnowledgeBaseService::reindex(&documents_folder, folder_filter.as_deref())
        .map_err(map_knowledge_base_error)?;
    let duration_ms = duration_ms(started.elapsed());

    if json {
        let payload = ReindexResponsePayload {
            status: "completed",
            documents_indexed: result.documents_indexed,
            embeddings_synced: result.embeddings_synced,
            embeddings_failed: result.embeddings_failed,
            folder_filter: result.folder_filter,
            duration_ms,
        };
        return print_json(&payload);
    }

    println!("Reindex complete.");
    println!("Documents indexed: {}", result.documents_indexed);
    println!("Embeddings synced: {}", result.embeddings_synced);
    println!("Embeddings failed: {}", result.embeddings_failed);
    println!("Duration: {}ms", duration_ms);

    Ok(())
}

fn handle_list(args: &ListArgs, json: bool) -> Result<(), CliError> {
    let documents_folder = load_documents_folder()?;
    let folder_filter = normalize_folder_filter(args.folder.as_deref())?;
    let mut documents =
        document_store::list_documents(&documents_folder).map_err(map_document_store_error)?;

    if let Some(filter) = folder_filter.as_deref() {
        documents.retain(|document| folder_matches_filter(&document.folder_path, filter));
    }

    sort_list_documents(&mut documents, args.sort.as_ref(), args.desc);

    let total = documents.len();
    if let Some(limit) = args.limit {
        documents.truncate(limit);
    }

    let mut payload_documents = Vec::with_capacity(documents.len());
    for document in documents {
        let size_bytes = read_document_size_bytes(&documents_folder, &document.id)?;
        payload_documents.push(ListDocumentPayload {
            id: document.id,
            title: document.title,
            folder: document.folder_path,
            tags: document.tags,
            created_at: document.created_at,
            modified_at: document.updated_at,
            size_bytes,
        });
    }

    let payload = ListResponsePayload {
        showing: payload_documents.len(),
        total,
        documents: payload_documents,
    };

    if json {
        return print_json(&payload);
    }

    println!(
        "{:<14} {:<30} {:<16} {:<24} {}",
        "ID", "TITLE", "FOLDER", "TAGS", "MODIFIED"
    );
    for document in &payload.documents {
        println!(
            "{:<14} {:<30} {:<16} {:<24} {}",
            truncate_display(&document.id, 14),
            truncate_display(&document.title, 30),
            truncate_display(&document.folder, 16),
            truncate_display(&document.tags.join(","), 24),
            document.modified_at
        );
    }
    println!("Showing {} of {}", payload.showing, payload.total);

    Ok(())
}

fn handle_search(args: &SearchArgs, json: bool) -> Result<(), CliError> {
    let documents_folder = load_documents_folder()?;
    let folder_filter = normalize_folder_filter(args.folder.as_deref())?;
    let tag_filter = parse_csv_values(args.tags.as_deref().unwrap_or_default());

    let started = Instant::now();
    let response = KnowledgeBaseService::search(
        &documents_folder,
        &args.query,
        SearchOptions {
            limit: args.limit.unwrap_or(20),
            folder_filter: folder_filter.clone(),
            ..SearchOptions::default()
        },
    )
    .map_err(map_knowledge_base_error)?;

    let mut results = Vec::new();
    for result in response.results {
        if !tags_match_filter(&result.tags, &tag_filter) {
            continue;
        }

        let (snippet, matched_chunks) = if args.snippets {
            match document_store::read_document(&documents_folder, &result.id) {
                Ok(document) => {
                    let snippet = build_snippet(&document.body, &args.query);
                    (snippet.clone(), snippet.map(|_| 1))
                }
                Err(DocumentStoreError::NotFound(_)) => (None, None),
                Err(error) => return Err(map_document_store_error(error)),
            }
        } else {
            (None, None)
        };

        results.push(SearchResultPayload {
            id: result.id,
            title: result.title,
            relevance_score: result.relevance_score,
            folder: result.folder_path,
            tags: result.tags,
            snippet,
            matched_chunks,
        });
    }

    if let Some(limit) = args.limit {
        results.truncate(limit);
    }

    let payload = SearchResponsePayload {
        query: response.query,
        total_results: results.len(),
        results,
        search_time_ms: duration_ms(started.elapsed()),
    };

    if json {
        return print_json(&payload);
    }

    println!(
        "{:<14} {:<30} {:<10} {:<16} {}",
        "ID", "TITLE", "RELEVANCE", "FOLDER", "TAGS"
    );
    for result in &payload.results {
        println!(
            "{:<14} {:<30} {:<10.3} {:<16} {}",
            truncate_display(&result.id, 14),
            truncate_display(&result.title, 30),
            result.relevance_score,
            truncate_display(&result.folder, 16),
            truncate_display(&result.tags.join(","), 32)
        );
        if let Some(snippet) = result.snippet.as_deref() {
            println!("  {}", truncate_display(snippet, 100));
        }
    }
    println!("Results: {}", payload.total_results);

    Ok(())
}

fn handle_read(args: &ReadArgs, json: bool) -> Result<(), CliError> {
    let documents_folder = load_documents_folder()?;
    let document = document_store::read_document(&documents_folder, &args.document_id)
        .map_err(map_document_store_error)?;
    let payload = map_document_to_read_payload(document);

    if json {
        return print_json(&payload);
    }

    if args.metadata {
        println!("{}", payload.title);
        println!("{}", "=".repeat(payload.title.len()));
        println!("Folder: {}", payload.folder);
        println!("Tags: {}", payload.tags.join(", "));
        println!("Modified: {}", payload.modified_at);
        println!();
    }
    println!("{}", payload.content);

    Ok(())
}

fn open_config_store() -> Result<ConfigStore, CliError> {
    let app_data_dir = resolve_app_data_dir()?;
    ConfigStore::new(&app_data_dir).map_err(map_config_error)
}

fn resolve_app_data_dir() -> Result<PathBuf, CliError> {
    default_data_dir().ok_or_else(|| CliError::General {
        message: "unable to determine a default application data directory".to_owned(),
    })
}

fn load_documents_folder() -> Result<PathBuf, CliError> {
    let config_store = open_config_store()?;
    let configured_value = config_store
        .get(KEY_DOCUMENTS_FOLDER)
        .map_err(map_config_error)?
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            CliError::invalid_arguments(
                "documents_folder is not configured. Run 'tentacle init' first.",
            )
        })?;

    resolve_documents_folder_path(&configured_value)
}

fn resolve_documents_folder_path(configured_value: &str) -> Result<PathBuf, CliError> {
    let value = configured_value.trim();
    if value.is_empty() {
        return Err(CliError::invalid_arguments(
            "documents_folder must not be empty",
        ));
    }

    expand_tilde_path(value)
}

fn expand_tilde_path(raw: &str) -> Result<PathBuf, CliError> {
    if raw == "~" {
        return home_dir().ok_or_else(|| CliError::General {
            message: "unable to resolve home directory for '~' path expansion".to_owned(),
        });
    }

    if let Some(stripped) = raw.strip_prefix("~/") {
        let home = home_dir().ok_or_else(|| CliError::General {
            message: "unable to resolve home directory for '~' path expansion".to_owned(),
        })?;
        return Ok(home.join(stripped));
    }

    Ok(PathBuf::from(raw))
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
}

fn get_config_text_or_default(store: &ConfigStore, key: ConfigKey) -> Result<String, CliError> {
    let value = match key {
        ConfigKey::DocumentsFolder => store
            .get(key.store_key())
            .map_err(map_config_error)?
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_DOCUMENTS_FOLDER_VALUE.to_owned()),
        ConfigKey::Editor => store
            .get(key.store_key())
            .map_err(map_config_error)?
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_EDITOR.to_owned()),
        ConfigKey::DefaultFolder => store
            .get(key.store_key())
            .map_err(map_config_error)?
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_FOLDER.to_owned()),
        ConfigKey::AutoTag => return Err(CliError::invalid_arguments("auto_tag is a boolean key")),
    };

    Ok(value)
}

fn get_config_bool_or_default(store: &ConfigStore, key: ConfigKey) -> Result<bool, CliError> {
    match key {
        ConfigKey::AutoTag => {
            let value = store.get(key.store_key()).map_err(map_config_error)?;
            let parsed = value
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| {
                    parse_bool(value).ok_or_else(|| {
                        CliError::invalid_arguments(format!(
                            "stored config value for auto_tag is invalid: \"{value}\""
                        ))
                    })
                })
                .transpose()?;

            Ok(parsed.unwrap_or(DEFAULT_AUTO_TAG))
        }
        _ => Err(CliError::invalid_arguments("requested key is not boolean")),
    }
}

fn get_config_value(store: &ConfigStore, key: ConfigKey) -> Result<ConfigValuePayload, CliError> {
    match key {
        ConfigKey::DocumentsFolder | ConfigKey::Editor | ConfigKey::DefaultFolder => Ok(
            ConfigValuePayload::Text(get_config_text_or_default(store, key)?),
        ),
        ConfigKey::AutoTag => Ok(ConfigValuePayload::Bool(get_config_bool_or_default(
            store, key,
        )?)),
    }
}

fn normalize_folder_filter(folder: Option<&str>) -> Result<Option<String>, CliError> {
    let Some(folder) = folder else {
        return Ok(None);
    };

    let replaced = folder.replace('\\', "/");
    let trimmed = replaced.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let mut segments: Vec<String> = Vec::new();
    for segment in trimmed.split('/') {
        let normalized = segment.trim();
        if normalized.is_empty() {
            continue;
        }
        if normalized == "." || normalized == ".." {
            return Err(CliError::invalid_arguments(
                "folder path must not include traversal segments",
            ));
        }
        segments.push(normalized.to_owned());
    }

    if segments.is_empty() {
        Ok(None)
    } else {
        Ok(Some(segments.join("/")))
    }
}

fn folder_matches_filter(folder_path: &str, folder_filter: &str) -> bool {
    if folder_filter.is_empty() {
        return true;
    }

    folder_path == folder_filter || folder_path.starts_with(&format!("{folder_filter}/"))
}

fn sort_list_documents(
    documents: &mut [StoredDocumentListItem],
    sort: Option<&ListSort>,
    desc: bool,
) {
    let sort_mode = sort.cloned().unwrap_or(ListSort::Modified);
    let descending = desc || sort.is_none();

    documents.sort_by(|left, right| {
        let order = match sort_mode {
            ListSort::Created => left
                .created_at
                .cmp(&right.created_at)
                .then_with(|| left.id.cmp(&right.id)),
            ListSort::Modified => left
                .updated_at
                .cmp(&right.updated_at)
                .then_with(|| left.id.cmp(&right.id)),
            ListSort::Title => left
                .title
                .cmp(&right.title)
                .then_with(|| left.id.cmp(&right.id)),
        };

        if descending {
            order.reverse()
        } else {
            order
        }
    });
}

fn parse_csv_values(raw: &str) -> Vec<String> {
    let mut seen: HashSet<String> = HashSet::new();
    let mut values = Vec::new();
    for token in raw.split(',') {
        let normalized = token.trim().to_lowercase();
        if normalized.is_empty() {
            continue;
        }
        if seen.insert(normalized.clone()) {
            values.push(normalized);
        }
    }
    values
}

fn tags_match_filter(tags: &[String], requested_tags: &[String]) -> bool {
    if requested_tags.is_empty() {
        return true;
    }

    let normalized_tags = tags
        .iter()
        .map(|tag| tag.to_lowercase())
        .collect::<HashSet<String>>();
    requested_tags
        .iter()
        .all(|requested_tag| normalized_tags.contains(requested_tag))
}

fn build_snippet(content: &str, query: &str) -> Option<String> {
    let normalized_content = content.trim();
    if normalized_content.is_empty() {
        return None;
    }

    let query = query.trim();
    if query.is_empty() {
        return Some(truncate_display(normalized_content, 160));
    }

    let content_lower = normalized_content.to_lowercase();
    let query_lower = query.to_lowercase();
    let query_start = content_lower.find(&query_lower).or_else(|| {
        query_lower
            .split_whitespace()
            .filter(|token| !token.is_empty())
            .find_map(|token| content_lower.find(token))
    });

    let Some(start_index) = query_start else {
        return Some(truncate_display(normalized_content, 160));
    };

    let mut start = start_index.saturating_sub(70);
    let mut end = (start_index + query_lower.len() + 90).min(normalized_content.len());
    while start > 0 && !normalized_content.is_char_boundary(start) {
        start -= 1;
    }
    while end < normalized_content.len() && !normalized_content.is_char_boundary(end) {
        end += 1;
    }

    let snippet = normalized_content[start..end].trim();
    if snippet.is_empty() {
        return None;
    }

    let prefix = if start > 0 { "..." } else { "" };
    let suffix = if end < normalized_content.len() {
        "..."
    } else {
        ""
    };
    Some(format!("{prefix}{snippet}{suffix}"))
}

fn map_document_to_read_payload(document: StoredDocument) -> ReadResponsePayload {
    let size_bytes = document.body.as_bytes().len() as u64;
    ReadResponsePayload {
        id: document.id,
        title: document.title,
        folder: document.folder_path,
        tags: document.tags,
        created_at: document.created_at,
        modified_at: document.updated_at,
        content: document.body,
        size_bytes,
    }
}

fn read_document_size_bytes(documents_folder: &Path, document_id: &str) -> Result<u64, CliError> {
    match document_store::read_document(documents_folder, document_id) {
        Ok(document) => Ok(document.body.as_bytes().len() as u64),
        Err(DocumentStoreError::NotFound(_)) => Ok(0),
        Err(error) => Err(map_document_store_error(error)),
    }
}

fn duration_ms(duration: std::time::Duration) -> u64 {
    u64::try_from(duration.as_millis()).unwrap_or(u64::MAX)
}

fn parse_bool(raw: &str) -> Option<bool> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" | "on" => Some(true),
        "false" | "0" | "no" | "off" => Some(false),
        _ => None,
    }
}

fn truncate_display(value: &str, max_chars: usize) -> String {
    if max_chars == 0 {
        return String::new();
    }

    let chars = value.chars().collect::<Vec<char>>();
    if chars.len() <= max_chars {
        return value.to_owned();
    }

    if max_chars <= 1 {
        return ".".to_owned();
    }

    let shortened = chars.into_iter().take(max_chars - 1).collect::<String>();
    format!("{shortened}.")
}

fn format_bytes(size_bytes: u64) -> String {
    const UNITS: [&str; 5] = ["B", "KB", "MB", "GB", "TB"];
    if size_bytes < 1024 {
        return format!("{size_bytes} B");
    }

    let mut value = size_bytes as f64;
    let mut unit_index = 0usize;
    while value >= 1024.0 && unit_index < UNITS.len() - 1 {
        value /= 1024.0;
        unit_index += 1;
    }
    format!("{value:.1} {}", UNITS[unit_index])
}

fn print_json<T: Serialize>(value: &T) -> Result<(), CliError> {
    let output = serde_json::to_string_pretty(value).map_err(|error| CliError::General {
        message: format!("failed to serialize JSON output: {error}"),
    })?;
    println!("{output}");
    Ok(())
}

fn map_config_error(error: ConfigError) -> CliError {
    match error {
        ConfigError::Io(io_error) => map_io_error(io_error),
        ConfigError::Sqlite(sqlite_error) => CliError::General {
            message: sqlite_error.to_string(),
        },
    }
}

fn map_document_store_error(error: DocumentStoreError) -> CliError {
    match error {
        DocumentStoreError::Validation(message) => CliError::invalid_arguments(message),
        DocumentStoreError::NotFound(message) => CliError::DocumentNotFound { message },
        DocumentStoreError::AlreadyExists(message) => CliError::General { message },
        DocumentStoreError::Io(io_error) => map_io_error(io_error),
    }
}

fn map_document_cache_error(error: DocumentCacheError) -> CliError {
    match error {
        DocumentCacheError::Validation(message) => CliError::invalid_arguments(message),
        DocumentCacheError::Sqlite(sqlite_error) => CliError::General {
            message: sqlite_error.to_string(),
        },
        DocumentCacheError::Io(io_error) => map_io_error(io_error),
    }
}

fn map_document_folders_error(error: DocumentFoldersError) -> CliError {
    match error {
        DocumentFoldersError::Validation(message) => CliError::invalid_arguments(message),
        DocumentFoldersError::NotFound(message) => CliError::FolderNotFound { message },
        DocumentFoldersError::AlreadyExists(message)
        | DocumentFoldersError::NonEmptyFolder(message) => CliError::General { message },
        DocumentFoldersError::Io(io_error) => map_io_error(io_error),
    }
}

fn map_knowledge_base_error(error: KnowledgeBaseError) -> CliError {
    match error {
        KnowledgeBaseError::DocumentStore(error) => map_document_store_error(error),
        KnowledgeBaseError::DocumentCache(error) => map_document_cache_error(error),
        KnowledgeBaseError::DocumentFolders(error) => map_document_folders_error(error),
        KnowledgeBaseError::Embedding(error) => CliError::General {
            message: error.to_string(),
        },
        KnowledgeBaseError::Io(error) => map_io_error(error),
        KnowledgeBaseError::Validation(message) => CliError::invalid_arguments(message),
    }
}

fn map_io_error(error: std::io::Error) -> CliError {
    match error.kind() {
        std::io::ErrorKind::PermissionDenied => CliError::PermissionDenied {
            message: error.to_string(),
        },
        _ => CliError::General {
            message: error.to_string(),
        },
    }
}
