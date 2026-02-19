use serde_json::Value;

const TARGET_CHUNK_CHARS: usize = 800;
const OVERLAP_CHARS: usize = 200;

#[derive(Debug, Clone)]
pub struct DocumentChunk {
    pub text: String,
    pub index: usize,
}

fn normalize_whitespace(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_owned()
}

fn collect_plain_text(node: &Value, parts: &mut Vec<String>) {
    match node {
        Value::String(text) => {
            if !text.is_empty() {
                parts.push(text.clone());
            }
        }
        Value::Array(entries) => {
            for entry in entries {
                collect_plain_text(entry, parts);
            }
        }
        Value::Object(map) => {
            if map.get("type").and_then(Value::as_str) == Some("hardBreak") {
                parts.push("\n".to_owned());
            }

            if let Some(text) = map.get("text").and_then(Value::as_str) {
                if !text.is_empty() {
                    parts.push(text.to_owned());
                }
            }

            if let Some(content) = map.get("content") {
                collect_plain_text(content, parts);
            }
        }
        _ => {}
    }
}

pub fn extract_plain_text_from_tiptap_or_raw(body: &str) -> String {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if let Ok(parsed) = serde_json::from_str::<Value>(trimmed) {
        let mut parts: Vec<String> = Vec::new();
        collect_plain_text(&parsed, &mut parts);
        let extracted = normalize_whitespace(&parts.join(" "));
        if !extracted.is_empty() {
            return extracted;
        }
    }

    normalize_whitespace(trimmed)
}

fn build_chunk_text(title: &str, body: &str) -> String {
    if title.is_empty() {
        return body.to_owned();
    }

    format!("{title}\n\n{body}")
}

fn tail_chars(value: &str, count: usize) -> String {
    let total_chars = value.chars().count();
    let skip_chars = total_chars.saturating_sub(count);
    value.chars().skip(skip_chars).collect()
}

pub fn chunk_document_text(title: &str, body_text: &str) -> Vec<DocumentChunk> {
    let normalized_title = title.trim();
    let normalized_body = body_text.trim();

    if normalized_body.is_empty() {
        return vec![DocumentChunk {
            text: normalized_title.to_owned(),
            index: 0,
        }];
    }

    if normalized_body.len() <= TARGET_CHUNK_CHARS {
        return vec![DocumentChunk {
            text: build_chunk_text(normalized_title, normalized_body),
            index: 0,
        }];
    }

    let mut chunks: Vec<DocumentChunk> = Vec::new();
    let mut current = String::new();
    let mut chunk_index = 0;

    for paragraph in normalized_body.split("\n\n") {
        let trimmed = paragraph.trim();
        if trimmed.is_empty() {
            continue;
        }

        let candidate = if current.is_empty() {
            trimmed.to_owned()
        } else {
            format!("{current}\n\n{trimmed}")
        };

        if candidate.len() > TARGET_CHUNK_CHARS && !current.is_empty() {
            chunks.push(DocumentChunk {
                text: build_chunk_text(normalized_title, &current),
                index: chunk_index,
            });
            chunk_index += 1;

            let overlap_text = tail_chars(&current, OVERLAP_CHARS);

            current = format!("{overlap_text}\n\n{trimmed}");
        } else {
            current = candidate;
        }
    }

    if !current.is_empty() {
        chunks.push(DocumentChunk {
            text: build_chunk_text(normalized_title, &current),
            index: chunk_index,
        });
    }

    if chunks.is_empty() {
        return vec![DocumentChunk {
            text: build_chunk_text(normalized_title, normalized_body),
            index: 0,
        }];
    }

    chunks
}

pub fn build_document_embedding_source_text(title: &str, body: &str) -> String {
    let normalized_title = title.trim();
    let plain_body = extract_plain_text_from_tiptap_or_raw(body);
    if plain_body.is_empty() {
        return normalized_title.to_owned();
    }

    if normalized_title.is_empty() {
        return plain_body;
    }

    format!("{normalized_title}\n\n{plain_body}")
}

pub fn format_query_for_embedding(query: &str) -> String {
    query.trim().to_owned()
}

#[cfg(test)]
mod tests {
    use super::{
        build_document_embedding_source_text, chunk_document_text,
        extract_plain_text_from_tiptap_or_raw, format_query_for_embedding,
    };

    #[test]
    fn extracts_plain_text_from_tiptap_json() {
        let body = r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"hello"},{"type":"text","text":"world"}]}]}"#;
        assert_eq!(extract_plain_text_from_tiptap_or_raw(body), "hello world");
    }

    #[test]
    fn falls_back_to_raw_text_for_non_json_body() {
        let body = "line one\nline two";
        assert_eq!(
            extract_plain_text_from_tiptap_or_raw(body),
            "line one line two"
        );
    }

    #[test]
    fn chunks_long_body_and_keeps_indices() {
        let long = format!("{}\n\n{}", "a".repeat(900), "b".repeat(900));
        let chunks = chunk_document_text("Title", &long);
        assert!(chunks.len() >= 2);
        assert_eq!(chunks[0].index, 0);
        assert_eq!(chunks[1].index, 1);
    }

    #[test]
    fn builds_embedding_source_text() {
        let source = build_document_embedding_source_text(
            "My title",
            r#"{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"body"}]}]}"#,
        );
        assert_eq!(source, "My title\n\nbody");
    }

    #[test]
    fn formats_query_instruction() {
        let formatted = format_query_for_embedding("my query");
        assert_eq!(formatted, "my query");
    }
}
