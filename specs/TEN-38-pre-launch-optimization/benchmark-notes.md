# TEN-38 Benchmark Notes

Date: 2026-02-19

## Commands Used

```bash
cargo build -p tentacle-cli

# isolated test home/config for repeatable local smoke run
export PERF_ROOT=/tmp/tentacle-perf.VD38Eu
export HOME="$PERF_ROOT/home"
export USERPROFILE="$PERF_ROOT/home"
export APPDATA="$PERF_ROOT/home/AppData/Roaming"
export LOCALAPPDATA="$PERF_ROOT/home/AppData/Local"
export XDG_DATA_HOME="$PERF_ROOT/xdg-data"
export HF_HOME="$PERF_ROOT/hf-home"
export HF_HUB_OFFLINE=1
export NO_COLOR=1
export PATH="$(pwd)/target/debug:$PATH"

tentacle --json init
tentacle --json config set documents_folder "$PERF_ROOT/documents"
./scripts/seed_stresstest_data.sh -n 240 -s 1337

# run 1 (cold-ish)
tentacle --json reindex

# run 2 (warm/incremental no content changes)
tentacle --json reindex
```

## Observed Results

- Seeded markdown documents: `240`
- Reindex run 1 wall-clock: `724ms`
- Reindex run 1 payload:
  - `documents_indexed`: `240`
  - `embeddings_synced`: `0`
  - `embeddings_failed`: `240`
  - `duration_ms`: `709`
- Reindex run 2 wall-clock: `688ms`
- Reindex run 2 payload:
  - `documents_indexed`: `240`
  - `embeddings_synced`: `0`
  - `embeddings_failed`: `240`
  - `duration_ms`: `674`
