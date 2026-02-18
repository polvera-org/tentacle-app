use assert_cmd::Command;
use predicates::str::contains;
use serde_json::Value;
use std::ffi::OsStr;
use std::fs;
use std::path::PathBuf;
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
