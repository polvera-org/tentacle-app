use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{self, IsTerminal, Write};
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tentacle_core::config::default_data_dir;

const WAITLIST_URL: &str = "https://tentaclenote.app/waitlist";
const INSTALL_COMMAND: &str = "curl --proto '=https' --tlsv1.2 -LsSf https://github.com/polvera-org/tentacle-app/releases/latest/download/tentacle-installer.sh | sh";
const STATE_FILE_NAME: &str = "cli-notifications-state.json";

#[derive(Debug, Default, Deserialize, Serialize)]
struct NotificationState {
    last_waitlist_day_utc: Option<u64>,
}

#[derive(Debug, Deserialize)]
struct SupabaseNotificationRow {
    #[serde(default)]
    notification_type: String,
    #[serde(default)]
    notification_data: serde_json::Value,
}

pub fn maybe_print_cli_notifications() {
    maybe_print_update_notification();
    maybe_print_waitlist_notification_once_per_day();
}

fn maybe_print_update_notification() {
    let Some((supabase_url, supabase_anon_key)) = supabase_env() else {
        return;
    };

    let endpoint = format!(
        "{}/rest/v1/notifications?select=notification_type,notification_data&notification_type=eq.UPDATE&user_id=is.null",
        supabase_url.trim_end_matches('/')
    );

    let client = match Client::builder().timeout(Duration::from_millis(1500)).build() {
        Ok(client) => client,
        Err(_) => return,
    };

    let response = match client
        .get(endpoint)
        .header("apikey", &supabase_anon_key)
        .header("Authorization", format!("Bearer {supabase_anon_key}"))
        .send()
    {
        Ok(response) => response,
        Err(_) => return,
    };

    if !response.status().is_success() {
        return;
    }

    let rows: Vec<SupabaseNotificationRow> = match response.json() {
        Ok(rows) => rows,
        Err(_) => return,
    };

    let local_version = env!("CARGO_PKG_VERSION");
    let mut latest_remote_version: Option<String> = None;
    let mut latest_message: Option<String> = None;
    let mut latest_release_url: Option<String> = None;

    for row in rows {
        if row.notification_type != "UPDATE" {
            continue;
        }

        let Some(version_id) = row
            .notification_data
            .get("version_id")
            .and_then(|value| value.as_str())
            .map(str::trim)
            .filter(|value| is_dotted_numeric_version(value))
        else {
            continue;
        };

        if compare_versions(version_id, local_version) <= 0 {
            continue;
        }

        let is_newer = latest_remote_version
            .as_ref()
            .map(|existing| compare_versions(version_id, existing) > 0)
            .unwrap_or(true);

        if is_newer {
            latest_remote_version = Some(version_id.to_owned());
            latest_message = row
                .notification_data
                .get("message")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned);
            latest_release_url = row
                .notification_data
                .get("release_url")
                .and_then(|value| value.as_str())
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned);
        }
    }

    let Some(remote_version) = latest_remote_version else {
        return;
    };

    let mut lines = vec![format!(
        "↑ Update available: tentacle v{remote_version} (you are on v{local_version})"
    )];

    if let Some(message) = latest_message {
        lines.push(message);
    }

    if let Some(release_url) = latest_release_url {
        lines.push(format!("Release notes: {release_url}"));
    }

    lines.push(format!("Upgrade: {INSTALL_COMMAND}"));

    print_colored_notice("\x1b[33m", "UPDATE", &lines);
}

fn maybe_print_waitlist_notification_once_per_day() {
    let Some(today_utc_day) = utc_day_number() else {
        return;
    };

    let mut state = load_state().unwrap_or_default();
    if state.last_waitlist_day_utc == Some(today_utc_day) {
        return;
    }

    let lines = vec![
        "Tentacle Pro waitlist is open.".to_owned(),
        "Get early access to cloud sync + RAG chat with your notes.".to_owned(),
        "Join now and get 1 month free when Pro launches.".to_owned(),
        format!("Join the waitlist: {WAITLIST_URL}"),
    ];

    print_colored_notice("\x1b[35m", "PRO WAITLIST", &lines);

    state.last_waitlist_day_utc = Some(today_utc_day);
    let _ = save_state(&state);
}

fn print_colored_notice(color: &str, label: &str, lines: &[String]) {
    let use_color = io::stdout().is_terminal();
    let (start, reset) = if use_color { (color, "\x1b[0m") } else { ("", "") };

    let mut out = io::stdout();
    let _ = writeln!(out, "");
    let _ = writeln!(out, "{start}┌─ {label}{reset}");
    for line in lines {
        let _ = writeln!(out, "{start}│{reset} {line}");
    }
    let _ = writeln!(out, "{start}└────────────────────────────────────────{reset}");
}

fn supabase_env() -> Option<(String, String)> {
    let url = std::env::var("TENTACLE_SUPABASE_URL")
        .ok()
        .or_else(|| std::env::var("NEXT_PUBLIC_SUPABASE_URL").ok())?;
    let key = std::env::var("TENTACLE_SUPABASE_ANON_KEY")
        .ok()
        .or_else(|| std::env::var("NEXT_PUBLIC_SUPABASE_ANON_KEY").ok())?;

    if url.trim().is_empty() || key.trim().is_empty() {
        return None;
    }

    Some((url, key))
}

fn utc_day_number() -> Option<u64> {
    let seconds = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs();
    Some(seconds / 86_400)
}

fn state_file_path() -> Option<PathBuf> {
    let dir = default_data_dir()?;
    Some(dir.join(STATE_FILE_NAME))
}

fn load_state() -> Option<NotificationState> {
    let path = state_file_path()?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<NotificationState>(&content).ok()
}

fn save_state(state: &NotificationState) -> Option<()> {
    let path = state_file_path()?;
    let parent = path.parent()?;
    fs::create_dir_all(parent).ok()?;
    let content = serde_json::to_string(state).ok()?;
    fs::write(path, content).ok()?;
    Some(())
}

fn is_dotted_numeric_version(version_id: &str) -> bool {
    let version_id = version_id.trim();
    if version_id.is_empty() {
        return false;
    }

    version_id
        .split('.')
        .all(|segment| !segment.is_empty() && segment.chars().all(|char| char.is_ascii_digit()))
}

fn compare_versions(left: &str, right: &str) -> i8 {
    let left_segments: Vec<u64> = left
        .trim()
        .split('.')
        .filter_map(|segment| segment.parse::<u64>().ok())
        .collect();
    let right_segments: Vec<u64> = right
        .trim()
        .split('.')
        .filter_map(|segment| segment.parse::<u64>().ok())
        .collect();

    let count = left_segments.len().max(right_segments.len());

    for idx in 0..count {
        let l = *left_segments.get(idx).unwrap_or(&0);
        let r = *right_segments.get(idx).unwrap_or(&0);

        if l > r {
            return 1;
        }
        if l < r {
            return -1;
        }
    }

    0
}
