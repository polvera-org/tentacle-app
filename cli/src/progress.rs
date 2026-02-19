use indicatif::{MultiProgress, ProgressBar, ProgressStyle};
use std::io::IsTerminal;
use std::sync::Arc;
use std::sync::Mutex;
use tentacle_core::knowledge_base::ProgressEvent;

/// Creates a progress callback for the reindex operation.
/// Returns None if stdout is not a terminal (e.g., piped output or JSON mode).
pub fn create_reindex_progress_callback() -> Option<Box<dyn FnMut(ProgressEvent) + Send>> {
    if !std::io::stdout().is_terminal() {
        return None;
    }

    let multi = Arc::new(MultiProgress::new());
    let state = Arc::new(Mutex::new(ReindexProgressState {
        multi: multi.clone(),
        loading_bar: None,
        syncing_bar: None,
    }));

    Some(Box::new(move |event: ProgressEvent| {
        let mut state = state.lock().unwrap();
        match event {
            ProgressEvent::Phase1Start { total_documents } => {
                let bar = state.multi.add(ProgressBar::new(total_documents as u64));
                bar.set_style(
                    ProgressStyle::default_bar()
                        .template("[1/2] Loading documents... [{bar:40}] {pos}/{len}")
                        .unwrap()
                        .progress_chars("━━╸"),
                );
                state.loading_bar = Some(bar);
            }
            ProgressEvent::Phase1Progress { current, total: _ } => {
                if let Some(bar) = &state.loading_bar {
                    bar.set_position(current as u64);
                }
            }
            ProgressEvent::Phase1Complete {
                documents_loaded: _,
            } => {
                if let Some(bar) = &state.loading_bar {
                    bar.finish();
                }
            }
            ProgressEvent::Phase2Start { total_documents } => {
                let bar = state.multi.add(ProgressBar::new(total_documents as u64));
                bar.set_style(
                    ProgressStyle::default_bar()
                        .template("[2/2] Syncing embeddings... [{bar:40}] {pos}/{len}")
                        .unwrap()
                        .progress_chars("━━╸"),
                );
                state.syncing_bar = Some(bar);
            }
            ProgressEvent::Phase2Progress {
                current,
                total: _,
                document_id: _,
            } => {
                if let Some(bar) = &state.syncing_bar {
                    bar.set_position(current as u64);
                }
            }
            ProgressEvent::Phase2Complete {
                synced: _,
                failed: _,
            } => {
                if let Some(bar) = &state.syncing_bar {
                    bar.finish();
                }
            }
        }
    }))
}

struct ReindexProgressState {
    multi: Arc<MultiProgress>,
    loading_bar: Option<ProgressBar>,
    syncing_bar: Option<ProgressBar>,
}

/// Creates a spinner with a message for long-running operations.
/// Returns None if stdout is not a terminal.
pub fn create_spinner_with_message(message: &str) -> Option<ProgressBar> {
    if !std::io::stdout().is_terminal() {
        return None;
    }

    let spinner = ProgressBar::new_spinner();
    spinner.set_style(
        ProgressStyle::default_spinner()
            .template("{spinner:.cyan} {msg}")
            .unwrap(),
    );
    spinner.set_message(message.to_owned());
    spinner.enable_steady_tick(std::time::Duration::from_millis(80));

    Some(spinner)
}
