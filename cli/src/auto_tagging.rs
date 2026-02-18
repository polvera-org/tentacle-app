use reqwest::blocking::Client;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Duration;
use tentacle_core::config::{ConfigError, ConfigStore};
use tentacle_core::document_cache::DocumentCacheStore;
use tentacle_core::document_store::{self, StoredDocument, TagUpdateMode};
use tentacle_core::knowledge_base::{KnowledgeBaseService, SearchOptions};
use tentacle_core::text_processing::extract_plain_text_from_tiptap_or_raw;

const KEY_AUTO_TAG: &str = "auto_tag";
const KEY_OPENAI_API_KEY: &str = "openai_api_key";
const OPENAI_API_KEY_ENV: &str = "OPENAI_API_KEY";
const OPENAI_CHAT_COMPLETIONS_URL_ENV: &str = "TENTACLE_OPENAI_CHAT_COMPLETIONS_URL";
const OPENAI_CHAT_COMPLETIONS_URL: &str = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL: &str = "gpt-4o-mini";

const AUTO_TAGGING_MIN_TEXT_LENGTH: usize = 40;
const AUTO_TAGGING_SEARCH_LENGTH: usize = 2000;
const AUTO_TAGGING_NOTE_TEXT_LENGTH: usize = 4000;
const AUTO_TAGGING_NEIGHBOR_LIMIT: usize = 12;
const MAX_SUGGESTED_TAGS: usize = 5;
const MAX_CANDIDATE_TAGS: usize = 100;
const REQUEST_TIMEOUT_MS: u64 = 12_000;

#[derive(Debug, Clone, Serialize)]
pub struct CreateAutoTaggingPayload {
    pub attempted: bool,
    pub applied_tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skipped_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub warning: Option<String>,
}

#[derive(Debug)]
pub struct CreateAutoTaggingOutcome {
    pub document: StoredDocument,
    pub payload: CreateAutoTaggingPayload,
}

pub fn apply_after_create(
    documents_folder: &Path,
    config_store: &ConfigStore,
    created: StoredDocument,
) -> CreateAutoTaggingOutcome {
    let auto_tag_enabled = match resolve_auto_tag_enabled(config_store) {
        Ok(enabled) => enabled,
        Err(error) => {
            return CreateAutoTaggingOutcome {
                document: created,
                payload: CreateAutoTaggingPayload {
                    attempted: false,
                    applied_tags: Vec::new(),
                    skipped_reason: Some("config_error".to_owned()),
                    warning: Some(error),
                },
            };
        }
    };
    if !auto_tag_enabled {
        return CreateAutoTaggingOutcome {
            document: created,
            payload: CreateAutoTaggingPayload {
                attempted: false,
                applied_tags: Vec::new(),
                skipped_reason: Some("disabled".to_owned()),
                warning: None,
            },
        };
    }

    let api_key = match resolve_api_key(config_store) {
        Ok(Some(api_key)) => api_key,
        Ok(None) => {
            return CreateAutoTaggingOutcome {
                document: created,
                payload: CreateAutoTaggingPayload {
                    attempted: false,
                    applied_tags: Vec::new(),
                    skipped_reason: Some("missing_api_key".to_owned()),
                    warning: None,
                },
            };
        }
        Err(error) => {
            return CreateAutoTaggingOutcome {
                document: created,
                payload: CreateAutoTaggingPayload {
                    attempted: false,
                    applied_tags: Vec::new(),
                    skipped_reason: Some("config_error".to_owned()),
                    warning: Some(error),
                },
            };
        }
    };

    let auto_tagging_text = build_auto_tagging_text(&created.title, &created.body);
    if auto_tagging_text.len() < AUTO_TAGGING_MIN_TEXT_LENGTH {
        return CreateAutoTaggingOutcome {
            document: created,
            payload: CreateAutoTaggingPayload {
                attempted: false,
                applied_tags: Vec::new(),
                skipped_reason: Some("note_too_short".to_owned()),
                warning: None,
            },
        };
    }

    let (candidate_tags, candidate_warning) =
        build_candidate_tags(documents_folder, &created.id, &auto_tagging_text);
    let suggested_tags = match request_suggested_tags(&auto_tagging_text, &candidate_tags, &api_key)
    {
        Ok(tags) => tags,
        Err(error) => {
            return CreateAutoTaggingOutcome {
                document: created,
                payload: CreateAutoTaggingPayload {
                    attempted: true,
                    applied_tags: Vec::new(),
                    skipped_reason: Some("request_failed".to_owned()),
                    warning: join_warnings(candidate_warning, Some(error)),
                },
            };
        }
    };

    if suggested_tags.is_empty() {
        return CreateAutoTaggingOutcome {
            document: created,
            payload: CreateAutoTaggingPayload {
                attempted: true,
                applied_tags: Vec::new(),
                skipped_reason: Some("no_suggestions".to_owned()),
                warning: candidate_warning,
            },
        };
    }

    let merged_tags = merge_tags(&created.tags, &suggested_tags);
    if merged_tags == created.tags {
        return CreateAutoTaggingOutcome {
            document: created,
            payload: CreateAutoTaggingPayload {
                attempted: true,
                applied_tags: Vec::new(),
                skipped_reason: Some("no_changes".to_owned()),
                warning: candidate_warning,
            },
        };
    }

    let updated = match document_store::update_document_tags(
        documents_folder,
        &created.id,
        &merged_tags,
        TagUpdateMode::Replace,
    ) {
        Ok(document) => document,
        Err(error) => {
            return CreateAutoTaggingOutcome {
                document: created,
                payload: CreateAutoTaggingPayload {
                    attempted: true,
                    applied_tags: Vec::new(),
                    skipped_reason: Some("update_failed".to_owned()),
                    warning: join_warnings(
                        candidate_warning,
                        Some(format!("failed to save auto-tagging result: {error}")),
                    ),
                },
            };
        }
    };

    let applied_tags = ordered_tag_difference(&updated.tags, &created.tags);
    let skipped_reason = if applied_tags.is_empty() {
        Some("no_changes".to_owned())
    } else {
        None
    };

    CreateAutoTaggingOutcome {
        document: updated,
        payload: CreateAutoTaggingPayload {
            attempted: true,
            applied_tags,
            skipped_reason,
            warning: candidate_warning,
        },
    }
}

fn build_candidate_tags(
    documents_folder: &Path,
    document_id: &str,
    auto_tagging_text: &str,
) -> (Vec<String>, Option<String>) {
    let mut warning: Option<String> = None;
    let cache_store = match DocumentCacheStore::new(documents_folder) {
        Ok(store) => store,
        Err(error) => {
            return (
                Vec::new(),
                Some(format!(
                    "failed to open cache while preparing auto-tagging: {error}"
                )),
            );
        }
    };

    let cached_documents = match cache_store.list_documents() {
        Ok(documents) => documents,
        Err(error) => {
            return (
                Vec::new(),
                Some(format!(
                    "failed to read cached documents for auto-tagging: {error}"
                )),
            );
        }
    };

    let mut tag_frequency: HashMap<String, usize> = HashMap::new();
    for document in &cached_documents {
        for tag in normalize_workspace_tags(&document.tags) {
            *tag_frequency.entry(tag).or_insert(0) += 1;
        }
    }

    let semantic_query = truncate_chars(auto_tagging_text, AUTO_TAGGING_SEARCH_LENGTH);
    let neighbor_results = match KnowledgeBaseService::search(
        documents_folder,
        &semantic_query,
        SearchOptions {
            limit: AUTO_TAGGING_NEIGHBOR_LIMIT,
            semantic_query: Some(semantic_query.clone()),
            exclude_document_id: Some(document_id.to_owned()),
            ..SearchOptions::default()
        },
    ) {
        Ok(response) => response.results,
        Err(error) => {
            warning = Some(format!(
                "failed to rank neighbor tags for auto-tagging: {error}"
            ));
            Vec::new()
        }
    };

    let mut neighbor_tag_set: HashSet<String> = HashSet::new();
    for result in neighbor_results {
        for tag in normalize_workspace_tags(&result.tags) {
            neighbor_tag_set.insert(tag);
        }
    }

    let mut ranked_tags = tag_frequency.into_iter().collect::<Vec<_>>();
    ranked_tags.sort_by(|(left_tag, left_count), (right_tag, right_count)| {
        let left_is_neighbor = neighbor_tag_set.contains(left_tag) as u8;
        let right_is_neighbor = neighbor_tag_set.contains(right_tag) as u8;

        right_is_neighbor
            .cmp(&left_is_neighbor)
            .then_with(|| right_count.cmp(left_count))
            .then_with(|| left_tag.cmp(right_tag))
    });

    let candidate_tags = ranked_tags
        .into_iter()
        .map(|(tag, _)| tag)
        .take(MAX_CANDIDATE_TAGS)
        .collect::<Vec<_>>();

    (candidate_tags, warning)
}

fn request_suggested_tags(
    note_text: &str,
    candidate_tags: &[String],
    api_key: &str,
) -> Result<Vec<String>, String> {
    let endpoint = std::env::var(OPENAI_CHAT_COMPLETIONS_URL_ENV)
        .ok()
        .and_then(|value| {
            let trimmed = value.trim().to_owned();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed)
            }
        })
        .unwrap_or_else(|| OPENAI_CHAT_COMPLETIONS_URL.to_owned());
    let normalized_note_text = normalize_whitespace(note_text);
    let user_content = [
        "Suggest relevant tags for this note.".to_owned(),
        "Prefer candidate tags when they fit.".to_owned(),
        String::new(),
        format!(
            "Existing workspace tags (reuse these): {}",
            serde_json::to_string(&normalize_openai_tags(candidate_tags))
                .unwrap_or_else(|_| "[]".to_owned())
        ),
        format!(
            "Note text: {}",
            serde_json::to_string(&truncate_chars(
                &normalized_note_text,
                AUTO_TAGGING_NOTE_TEXT_LENGTH
            ))
            .unwrap_or_else(|_| "\"\"".to_owned())
        ),
    ]
    .join("\n");

    let payload = json!({
        "model": OPENAI_MODEL,
        "temperature": 0.2,
        "max_tokens": 96,
        "messages": [
            {
                "role": "system",
                "content": "You generate concise note tags. Respond with a JSON array only. Max 5 tags. Each tag must be lowercase kebab-case (hyphens only, no underscores, no spaces, no leading #). Reuse existing tags exactly as given whenever they fit. Only invent a new tag when none of the existing tags apply."
            },
            {
                "role": "user",
                "content": user_content
            }
        ]
    });

    let client = Client::builder()
        .timeout(Duration::from_millis(REQUEST_TIMEOUT_MS))
        .build()
        .map_err(|error| format!("failed to build OpenAI HTTP client: {error}"))?;

    let response = client
        .post(endpoint)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .map_err(|error| format!("auto-tagging request failed: {error}"))?;

    let status = response.status();
    let response_payload = response.json::<Value>().unwrap_or(Value::Null);

    if !status.is_success() {
        let api_error = response_payload
            .get("error")
            .and_then(|error| error.get("message"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|message| !message.is_empty())
            .map(str::to_owned);
        return Err(api_error.unwrap_or_else(|| {
            format!(
                "OpenAI tag suggestion failed with status {}.",
                status.as_u16()
            )
        }));
    }

    let content = response_payload
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .unwrap_or_default();

    let parsed_tags = parse_tags_from_content(content);
    Ok(normalize_openai_tags(&parsed_tags))
}

fn parse_tags_from_content(content: &str) -> Vec<String> {
    let normalized_content = content.trim();
    if normalized_content.is_empty() {
        return Vec::new();
    }

    let direct_parse = try_parse_tags(normalized_content);
    if !direct_parse.is_empty() {
        return direct_parse;
    }

    if let Some((fence_start, fence_end)) = find_wrapped_section(normalized_content, "```", "```") {
        let fenced_content = normalized_content[fence_start..fence_end].trim();
        let without_json_prefix = fenced_content
            .strip_prefix("json")
            .map(str::trim_start)
            .unwrap_or(fenced_content);

        let fenced_parse = try_parse_tags(without_json_prefix);
        if !fenced_parse.is_empty() {
            return fenced_parse;
        }
    }

    if let Some((array_start, array_end)) = find_wrapped_section(normalized_content, "[", "]") {
        let sliced = &normalized_content[array_start..array_end];
        let sliced_parse = try_parse_tags(sliced);
        if !sliced_parse.is_empty() {
            return sliced_parse;
        }
    }

    Vec::new()
}

fn try_parse_tags(candidate: &str) -> Vec<String> {
    let value = match serde_json::from_str::<Value>(candidate) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    parse_tags_from_value(&value)
}

fn parse_tags_from_value(value: &Value) -> Vec<String> {
    match value {
        Value::Array(entries) => entries
            .iter()
            .filter_map(Value::as_str)
            .map(str::to_owned)
            .collect(),
        Value::Object(map) => map
            .get("tags")
            .and_then(Value::as_array)
            .map(|entries| {
                entries
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
        _ => Vec::new(),
    }
}

fn find_wrapped_section(
    content: &str,
    start_marker: &str,
    end_marker: &str,
) -> Option<(usize, usize)> {
    let start = content.find(start_marker)?;
    let inner_start = start + start_marker.len();
    let rest = &content[inner_start..];
    let end = rest.find(end_marker)?;
    Some((inner_start, inner_start + end))
}

fn normalize_workspace_tags(tags: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for tag in tags {
        let Some(next) = normalize_workspace_tag(tag) else {
            continue;
        };
        if seen.insert(next.clone()) {
            normalized.push(next);
        }
    }

    normalized
}

fn normalize_workspace_tag(raw_tag: &str) -> Option<String> {
    let cleaned = raw_tag.trim().trim_start_matches('#').trim();
    if cleaned.is_empty() {
        return None;
    }

    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join("_");
    if collapsed.is_empty() {
        return None;
    }
    Some(collapsed.to_lowercase())
}

fn normalize_openai_tags(tags: &[String]) -> Vec<String> {
    let mut normalized = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for raw_tag in tags {
        let mut tag = String::new();
        let mut previous_is_dash = false;
        for (index, character) in raw_tag.chars().enumerate() {
            if character.is_control() {
                continue;
            }
            if character == '#' && index == 0 {
                continue;
            }
            if character == '_' || character.is_whitespace() {
                if !previous_is_dash && !tag.is_empty() {
                    tag.push('-');
                    previous_is_dash = true;
                }
                continue;
            }

            previous_is_dash = false;
            tag.push(character.to_ascii_lowercase());
        }

        let trimmed = tag.trim_matches('-').to_owned();
        if trimmed.len() < 3 || !seen.insert(trimmed.clone()) {
            continue;
        }
        normalized.push(trimmed);
        if normalized.len() == MAX_SUGGESTED_TAGS {
            break;
        }
    }

    normalized
}

fn merge_tags(existing_tags: &[String], incoming_tags: &[String]) -> Vec<String> {
    let mut merged = existing_tags.to_vec();
    let mut seen = existing_tags
        .iter()
        .map(|tag| tag.to_ascii_lowercase())
        .collect::<HashSet<_>>();

    for incoming in incoming_tags {
        let key = incoming.to_ascii_lowercase();
        if seen.insert(key) {
            merged.push(incoming.clone());
        }
    }

    merged
}

fn ordered_tag_difference(left: &[String], right: &[String]) -> Vec<String> {
    let right_set = right
        .iter()
        .map(|value| value.to_ascii_lowercase())
        .collect::<HashSet<_>>();
    left.iter()
        .filter(|value| !right_set.contains(&value.to_ascii_lowercase()))
        .cloned()
        .collect()
}

fn build_auto_tagging_text(title: &str, body: &str) -> String {
    let normalized_title = normalize_whitespace(title);
    let normalized_body = normalize_whitespace(&extract_plain_text_from_tiptap_or_raw(body));

    let mut parts = Vec::new();
    if !normalized_title.is_empty() {
        parts.push(normalized_title);
    }
    if !normalized_body.is_empty() {
        parts.push(normalized_body);
    }
    parts.join("\n")
}

fn normalize_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_owned();
    }

    value.chars().take(max_chars).collect::<String>()
}

fn resolve_auto_tag_enabled(store: &ConfigStore) -> Result<bool, String> {
    let value = store
        .get(KEY_AUTO_TAG)
        .map_err(map_config_error_to_string)?;
    let parsed = value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| {
            parse_bool(value)
                .ok_or_else(|| format!("stored config value for auto_tag is invalid: \"{value}\""))
        })
        .transpose()?;

    Ok(parsed.unwrap_or(true))
}

fn resolve_api_key(store: &ConfigStore) -> Result<Option<String>, String> {
    let config_value = store
        .get(KEY_OPENAI_API_KEY)
        .map_err(map_config_error_to_string)?
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    if config_value.is_some() {
        return Ok(config_value);
    }

    let env_value = std::env::var(OPENAI_API_KEY_ENV)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    Ok(env_value)
}

fn join_warnings(first: Option<String>, second: Option<String>) -> Option<String> {
    match (first, second) {
        (None, None) => None,
        (Some(first), None) => Some(first),
        (None, Some(second)) => Some(second),
        (Some(first), Some(second)) => Some(format!("{first}; {second}")),
    }
}

fn map_config_error_to_string(error: ConfigError) -> String {
    match error {
        ConfigError::Sqlite(error) => error.to_string(),
        ConfigError::Io(error) => error.to_string(),
    }
}

fn parse_bool(value: &str) -> Option<bool> {
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" | "on" => Some(true),
        "false" | "0" | "no" | "off" => Some(false),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::{normalize_openai_tags, parse_tags_from_content};

    #[test]
    fn parses_direct_json_array_response() {
        let parsed = parse_tags_from_content("[\"ml\", \"api-design\"]");
        assert_eq!(parsed, vec!["ml".to_owned(), "api-design".to_owned()]);
    }

    #[test]
    fn parses_fenced_json_payload() {
        let parsed = parse_tags_from_content("```json\n{\"tags\":[\"alpha\",\"beta\"]}\n```");
        assert_eq!(parsed, vec!["alpha".to_owned(), "beta".to_owned()]);
    }

    #[test]
    fn normalizes_openai_tags_to_kebab_case_and_dedupes() {
        let tags = vec![
            "#Planning".to_owned(),
            "road map".to_owned(),
            "road_map".to_owned(),
            "X".to_owned(),
        ];
        let normalized = normalize_openai_tags(&tags);
        assert_eq!(
            normalized,
            vec!["planning".to_owned(), "road-map".to_owned()]
        );
    }
}
