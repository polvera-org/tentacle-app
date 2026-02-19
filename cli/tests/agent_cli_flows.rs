use assert_cmd::Command;
use predicates::str::contains;
use serde_json::Value;
use std::ffi::OsStr;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;
use tempfile::{tempdir, TempDir};

struct CliTestEnv {
    temp_dir: TempDir,
    home_dir: PathBuf,
    documents_dir: PathBuf,
    hf_home_dir: PathBuf,
    xdg_data_home: PathBuf,
}

impl CliTestEnv {
    fn new() -> Self {
        let temp_dir = tempdir().expect("failed to create temporary test directory");
        let home_dir = temp_dir.path().join("home");
        let documents_dir = temp_dir.path().join("documents");
        let hf_home_dir = temp_dir.path().join("hf-home");
        let xdg_data_home = temp_dir.path().join("xdg-data");

        fs::create_dir_all(&home_dir).expect("failed to create temporary home directory");
        fs::create_dir_all(&documents_dir).expect("failed to create documents directory");
        fs::create_dir_all(&hf_home_dir).expect("failed to create hf home directory");
        fs::create_dir_all(&xdg_data_home).expect("failed to create xdg data directory");

        Self {
            temp_dir,
            home_dir,
            documents_dir,
            hf_home_dir,
            xdg_data_home,
        }
    }

    fn command(&self) -> Command {
        let mut command = Command::cargo_bin("tentacle").expect("failed to locate tentacle binary");
        command.current_dir(self.temp_dir.path());
        command.env("HOME", &self.home_dir);
        command.env("USERPROFILE", &self.home_dir);
        command.env("APPDATA", self.home_dir.join("AppData/Roaming"));
        command.env("LOCALAPPDATA", self.home_dir.join("AppData/Local"));
        command.env("XDG_DATA_HOME", &self.xdg_data_home);
        command.env("HF_HOME", &self.hf_home_dir);
        command.env("HF_HUB_OFFLINE", "1");
        command.env("NO_COLOR", "1");
        command.env_remove("OPENAI_API_KEY");
        command.env_remove("TENTACLE_OPENAI_CHAT_COMPLETIONS_URL");
        command
    }

    fn bootstrap(&self) {
        let init_payload = self.run_json_success(["init"]);
        assert_eq!(init_payload["status"], "initialized");

        let documents_folder = self.documents_dir.to_string_lossy().into_owned();
        let set_payload = self.run_json_success(vec![
            "config".to_owned(),
            "set".to_owned(),
            "documents_folder".to_owned(),
            documents_folder,
        ]);
        assert_eq!(set_payload["status"], "updated");
    }

    fn run_json_success<I, S>(&self, args: I) -> Value
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = self.command();
        let output = command
            .arg("--json")
            .args(args)
            .assert()
            .success()
            .get_output()
            .clone();

        parse_json(
            &output.stdout,
            "stdout",
            &output.stderr,
            "stderr",
            "expected success JSON payload",
        )
    }

    fn run_json_success_with_stdin<I, S>(&self, args: I, stdin: &str) -> Value
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = self.command();
        let output = command
            .arg("--json")
            .args(args)
            .write_stdin(stdin)
            .assert()
            .success()
            .get_output()
            .clone();

        parse_json(
            &output.stdout,
            "stdout",
            &output.stderr,
            "stderr",
            "expected success JSON payload",
        )
    }

    fn run_json_success_with_stdin_and_env<I, S>(
        &self,
        args: I,
        stdin: &str,
        envs: &[(&str, &str)],
    ) -> Value
    where
        I: IntoIterator<Item = S>,
        S: AsRef<OsStr>,
    {
        let mut command = self.command();
        for (key, value) in envs {
            command.env(key, value);
        }

        let output = command
            .arg("--json")
            .args(args)
            .write_stdin(stdin)
            .assert()
            .success()
            .get_output()
            .clone();

        parse_json(
            &output.stdout,
            "stdout",
            &output.stderr,
            "stderr",
            "expected success JSON payload",
        )
    }

    fn write_markdown_fixture(
        &self,
        relative_path: &str,
        id: &str,
        title: &str,
        tags: &[&str],
        body: &str,
    ) {
        let full_path = self.documents_dir.join(relative_path);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).unwrap_or_else(|error| {
                panic!("failed to create fixture parent directory: {error}")
            });
        }

        let tags_json = serde_json::to_string(&tags)
            .unwrap_or_else(|error| panic!("failed to serialize fixture tags: {error}"));
        let content = format!(
            "---\nid: \"{id}\"\ncreated_at: \"2026-02-16T00:00:00Z\"\nupdated_at: \"2026-02-16T00:00:00Z\"\ntags: {tags_json}\ntags_locked: false\n---\n\n# {title}\n\n{body}\n"
        );
        fs::write(&full_path, content)
            .unwrap_or_else(|error| panic!("failed to write fixture markdown file: {error}"));
    }
}

fn parse_json(
    bytes: &[u8],
    source_name: &str,
    alternate_bytes: &[u8],
    alternate_name: &str,
    context: &str,
) -> Value {
    serde_json::from_slice(bytes).unwrap_or_else(|error| {
        panic!(
            "{context}; failed to parse {source_name} as JSON: {error}; {source_name}: {}; {alternate_name}: {}",
            String::from_utf8_lossy(bytes),
            String::from_utf8_lossy(alternate_bytes),
        )
    })
}

fn json_string_array(payload: &Value, key: &str) -> Vec<String> {
    payload
        .get(key)
        .and_then(Value::as_array)
        .unwrap_or_else(|| panic!("missing JSON array key: {key}"))
        .iter()
        .map(|entry| {
            entry
                .as_str()
                .unwrap_or_else(|| panic!("array key {key} must contain string values"))
                .to_owned()
        })
        .collect()
}

struct MockOpenAiServer {
    url: String,
    join_handle: Option<thread::JoinHandle<()>>,
}

impl MockOpenAiServer {
    fn spawn(status_code: u16, response_body: &str) -> Self {
        let listener =
            TcpListener::bind("127.0.0.1:0").expect("failed to bind mock OpenAI TCP listener");
        let address = listener
            .local_addr()
            .expect("mock OpenAI listener missing local addr");
        let body = response_body.to_owned();

        let join_handle = thread::spawn(move || {
            let _ = listener.set_nonblocking(false);
            let Ok((mut stream, _)) = listener.accept() else {
                return;
            };

            let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
            let mut request_buffer = [0u8; 8192];
            let _ = stream.read(&mut request_buffer);

            let reason = reason_phrase(status_code);
            let response = format!(
                "HTTP/1.1 {status_code} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.as_bytes().len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
        });

        Self {
            url: format!("http://{address}/v1/chat/completions"),
            join_handle: Some(join_handle),
        }
    }
}

impl Drop for MockOpenAiServer {
    fn drop(&mut self) {
        if let Some(handle) = self.join_handle.take() {
            let _ = handle.join();
        }
    }
}

fn reason_phrase(status_code: u16) -> &'static str {
    match status_code {
        200 => "OK",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        502 => "Bad Gateway",
        503 => "Service Unavailable",
        504 => "Gateway Timeout",
        _ => "Unknown",
    }
}

#[test]
fn init_reindex_search_and_read_with_nested_fixture_docs() {
    let env = CliTestEnv::new();
    env.bootstrap();

    env.write_markdown_fixture(
        "inbox/capture-ops.md",
        "capture-ops",
        "Capture Ops",
        &["voice", "mvp"],
        "Voice capture converts raw thoughts into searchable notes.",
    );
    env.write_markdown_fixture(
        "projects/alpha/search-brief.md",
        "search-brief",
        "Search Brief",
        &["search", "alpha"],
        "Hybrid search blends lexical scoring with semantic matching.",
    );

    let reindex_payload = env.run_json_success(["reindex"]);
    assert_eq!(reindex_payload["status"], "completed");
    assert_eq!(reindex_payload["documents_indexed"].as_u64(), Some(2));
    assert!(
        reindex_payload["embeddings_synced"].as_u64().is_some(),
        "reindex JSON payload must include numeric embeddings_synced"
    );
    assert!(
        reindex_payload["embeddings_failed"].as_u64().is_some(),
        "reindex JSON payload must include numeric embeddings_failed"
    );

    let search_payload = env.run_json_success([
        "search",
        "hybrid search",
        "--folder",
        "projects",
        "--snippets",
    ]);
    assert_eq!(search_payload["query"], "hybrid search");
    assert!(search_payload["total_results"].as_u64().unwrap_or(0) >= 1);

    let results = search_payload["results"]
        .as_array()
        .expect("search payload must include results array");
    let search_hit = results
        .iter()
        .find(|result| result["id"] == "search-brief")
        .expect("expected search-brief result");
    assert_eq!(search_hit["folder"], "projects/alpha");
    assert!(search_hit
        .get("snippet")
        .and_then(Value::as_str)
        .map(|snippet| snippet.to_ascii_lowercase().contains("hybrid search"))
        .unwrap_or(false));

    let read_payload = env.run_json_success(["read", "search-brief"]);
    assert_eq!(read_payload["id"], "search-brief");
    assert_eq!(read_payload["folder"], "projects/alpha");
    assert!(read_payload["content"]
        .as_str()
        .unwrap_or_default()
        .contains("semantic matching"));
}

#[test]
fn create_from_stdin_persists_document_content() {
    let env = CliTestEnv::new();
    env.bootstrap();

    let create_payload = env.run_json_success_with_stdin(
        [
            "create",
            "--folder",
            "capture/live",
            "--tags",
            "voice,ideas",
        ],
        "# Voice Memo\n\nCaptured from stdin in one shot.\n",
    );

    let document_id = create_payload["id"]
        .as_str()
        .expect("create payload must include string id")
        .to_owned();

    assert_eq!(create_payload["title"], "Voice Memo");
    assert_eq!(create_payload["folder"], "capture/live");
    assert_eq!(
        json_string_array(&create_payload, "tags"),
        vec!["voice".to_owned(), "ideas".to_owned()]
    );

    let read_payload = env.run_json_success(vec!["read".to_owned(), document_id]);
    assert_eq!(read_payload["title"], "Voice Memo");
    assert_eq!(read_payload["folder"], "capture/live");
    assert!(read_payload["content"]
        .as_str()
        .unwrap_or_default()
        .contains("Captured from stdin in one shot."));
}

#[test]
fn create_folder_flag_is_not_persisted_between_commands() {
    let env = CliTestEnv::new();
    env.bootstrap();

    let first_create = env.run_json_success_with_stdin(
        ["create", "--folder", "projects/alpha", "--title", "First"],
        "First body.\n",
    );
    assert_eq!(first_create["folder"], "projects/alpha");

    let second_create =
        env.run_json_success_with_stdin(["create", "--title", "Second"], "Second body.\n");
    assert_eq!(second_create["folder"], "");
}

#[test]
fn create_auto_tagging_applies_tags_from_openai() {
    let env = CliTestEnv::new();
    env.bootstrap();

    env.write_markdown_fixture(
        "projects/alpha/neighbor.md",
        "neighbor",
        "Neighbor",
        &["planning", "infra"],
        "Roadmap planning for infrastructure migrations and scope alignment.",
    );
    let _ = env.run_json_success(["reindex"]);

    let server = MockOpenAiServer::spawn(
        200,
        r#"{"choices":[{"message":{"content":"[\"roadmap\",\"weekly-review\"]"}}]}"#,
    );
    let create_payload = env.run_json_success_with_stdin_and_env(
        ["create", "--title", "AutoTag", "--tags", "draft"],
        "Detailed roadmap planning for the next sprint and weekly review with infra.",
        &[
            ("OPENAI_API_KEY", "test-key"),
            ("TENTACLE_OPENAI_CHAT_COMPLETIONS_URL", server.url.as_str()),
        ],
    );

    let tags = json_string_array(&create_payload, "tags");
    assert!(tags.iter().any(|tag| tag == "draft"));
    assert!(tags.iter().any(|tag| tag == "roadmap"));
    assert!(tags.iter().any(|tag| tag == "weekly-review"));

    assert_eq!(create_payload["auto_tagging"]["attempted"], true);
    assert_eq!(
        create_payload["auto_tagging"]["skipped_reason"],
        Value::Null
    );
    assert_eq!(create_payload["auto_tagging"]["warning"], Value::Null);
    let applied_tags = json_string_array(&create_payload["auto_tagging"], "applied_tags");
    assert!(applied_tags.iter().any(|tag| tag == "roadmap"));
}

#[test]
fn create_auto_tagging_skips_when_api_key_is_missing() {
    let env = CliTestEnv::new();
    env.bootstrap();

    let create_payload = env.run_json_success_with_stdin(
        ["create", "--title", "No key"],
        "Long enough content to trigger auto-tagging but no key is configured in env or config.",
    );

    assert_eq!(create_payload["auto_tagging"]["attempted"], false);
    assert_eq!(
        create_payload["auto_tagging"]["skipped_reason"],
        "missing_api_key"
    );
    assert_eq!(create_payload["auto_tagging"]["warning"], Value::Null);
}

#[test]
fn create_auto_tagging_skips_when_feature_is_disabled() {
    let env = CliTestEnv::new();
    env.bootstrap();

    let set_payload = env.run_json_success(["config", "set", "auto_tag", "false"]);
    assert_eq!(set_payload["status"], "updated");

    let create_payload = env.run_json_success_with_stdin_and_env(
        ["create", "--title", "Disabled"],
        "Long enough content to trigger auto-tagging if it were enabled.",
        &[("OPENAI_API_KEY", "test-key")],
    );

    assert_eq!(create_payload["auto_tagging"]["attempted"], false);
    assert_eq!(create_payload["auto_tagging"]["skipped_reason"], "disabled");
}

#[test]
fn create_auto_tagging_request_failure_is_non_fatal() {
    let env = CliTestEnv::new();
    env.bootstrap();

    let server = MockOpenAiServer::spawn(500, r#"{"error":{"message":"temporary outage"}}"#);
    let create_payload = env.run_json_success_with_stdin_and_env(
        ["create", "--title", "Failing request"],
        "Long enough content to trigger auto-tagging and return an upstream API failure.",
        &[
            ("OPENAI_API_KEY", "test-key"),
            ("TENTACLE_OPENAI_CHAT_COMPLETIONS_URL", server.url.as_str()),
        ],
    );

    assert_eq!(create_payload["title"], "Failing request");
    assert_eq!(create_payload["auto_tagging"]["attempted"], true);
    assert_eq!(
        create_payload["auto_tagging"]["skipped_reason"],
        "request_failed"
    );
    assert!(create_payload["auto_tagging"]["warning"]
        .as_str()
        .unwrap_or_default()
        .contains("temporary outage"));
}

#[test]
fn tag_merge_remove_and_replace_flow() {
    let env = CliTestEnv::new();
    env.bootstrap();

    env.write_markdown_fixture(
        "inbox/tag-target.md",
        "tag-target",
        "Tag Target",
        &["alpha", "beta"],
        "Tag mutation baseline.",
    );

    let merged = env.run_json_success(["tag", "tag-target", "beta,gamma"]);
    assert_eq!(
        json_string_array(&merged, "tags"),
        vec!["alpha".to_owned(), "beta".to_owned(), "gamma".to_owned()]
    );
    assert_eq!(
        json_string_array(&merged, "tags_added"),
        vec!["gamma".to_owned()]
    );
    assert!(json_string_array(&merged, "tags_removed").is_empty());

    let removed = env.run_json_success(["tag", "tag-target", "alpha", "--remove"]);
    assert_eq!(
        json_string_array(&removed, "tags"),
        vec!["beta".to_owned(), "gamma".to_owned()]
    );
    assert!(json_string_array(&removed, "tags_added").is_empty());
    assert_eq!(
        json_string_array(&removed, "tags_removed"),
        vec!["alpha".to_owned()]
    );

    let replaced = env.run_json_success(["tag", "tag-target", "solo", "--replace"]);
    assert_eq!(
        json_string_array(&replaced, "tags"),
        vec!["solo".to_owned()]
    );
    assert_eq!(
        json_string_array(&replaced, "tags_added"),
        vec!["solo".to_owned()]
    );
    assert_eq!(
        json_string_array(&replaced, "tags_removed"),
        vec!["beta".to_owned(), "gamma".to_owned()]
    );
}

#[test]
fn folder_create_rename_delete_moves_documents_to_inbox() {
    let env = CliTestEnv::new();
    env.bootstrap();

    let created_folder = env.run_json_success(["folder", "create", "projects/alpha"]);
    assert_eq!(created_folder["path"], "projects/alpha");

    let created_document = env.run_json_success_with_stdin(
        [
            "create",
            "--folder",
            "projects/alpha",
            "--title",
            "Folder Flow",
            "--tags",
            "ops",
        ],
        "Folder lifecycle coverage.\n",
    );
    let document_id = created_document["id"]
        .as_str()
        .expect("create payload must include string id")
        .to_owned();

    let renamed_folder = env.run_json_success(["folder", "rename", "projects/alpha", "beta"]);
    assert_eq!(renamed_folder["old_name"], "projects/alpha");
    assert_eq!(renamed_folder["new_name"], "projects/beta");
    assert_eq!(renamed_folder["document_count"].as_u64(), Some(1));

    let read_after_rename = env.run_json_success(vec!["read".to_owned(), document_id.clone()]);
    assert_eq!(read_after_rename["folder"], "projects/beta");

    let delete_payload = env.run_json_success(["folder", "delete", "projects/beta", "--force"]);
    assert_eq!(delete_payload["status"], "deleted");
    assert_eq!(delete_payload["documents_moved"].as_u64(), Some(1));
    assert_eq!(delete_payload["moved_to"], "inbox");

    let read_after_delete = env.run_json_success(vec!["read".to_owned(), document_id]);
    assert_eq!(read_after_delete["folder"], "inbox");

    let folder_list_payload = env.run_json_success(["folder", "list"]);
    let folders = folder_list_payload["folders"]
        .as_array()
        .expect("folder list payload must include folders array");

    assert!(!folders
        .iter()
        .any(|folder| folder["path"] == "projects/beta"));
    assert!(folders.iter().any(|folder| folder["path"] == "inbox"));
}

#[test]
fn json_success_and_error_payloads_are_machine_parseable() {
    let env = CliTestEnv::new();
    env.bootstrap();

    let status_payload = env.run_json_success(["status"]);
    assert!(status_payload.get("documents").is_some());
    assert!(status_payload.get("folders").is_some());
    assert!(status_payload.get("index_size_bytes").is_some());

    let mut failing_command = env.command();
    let failure_assert = failing_command
        .arg("--json")
        .args(["read", "missing-doc"])
        .assert()
        .code(2)
        .stderr(contains("\"code\": \"document_not_found\""));

    let failure_output = failure_assert.get_output().clone();
    let error_payload = parse_json(
        &failure_output.stderr,
        "stderr",
        &failure_output.stdout,
        "stdout",
        "expected error JSON payload",
    );

    assert_eq!(error_payload["error"]["code"], "document_not_found");
    assert!(error_payload["error"]["message"]
        .as_str()
        .unwrap_or_default()
        .contains("missing-doc"));
}

#[test]
fn deferred_commands_return_not_implemented_with_exit_code_four() {
    let env = CliTestEnv::new();

    let mut deferred_command = env.command();
    let deferred_assert = deferred_command
        .arg("--json")
        .args(["edit", "future-work"])
        .assert()
        .code(4)
        .stderr(contains("\"code\": \"not_implemented\""));

    let deferred_output = deferred_assert.get_output().clone();
    let error_payload = parse_json(
        &deferred_output.stderr,
        "stderr",
        &deferred_output.stdout,
        "stdout",
        "expected error JSON payload",
    );

    assert_eq!(error_payload["error"]["code"], "not_implemented");
    assert!(error_payload["error"]["message"]
        .as_str()
        .unwrap_or_default()
        .contains("edit"));
}
