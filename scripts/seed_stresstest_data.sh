#!/bin/bash

set -euo pipefail

readonly DEFAULT_SEED=1337
readonly ROOT_TARGET_PERCENT=40
readonly MAX_ATTEMPTS_MULTIPLIER=8

SUBFOLDERS=(
  "inbox"
  "projects"
  "research"
  "meetings"
  "personal"
  "archive/2026"
)

THEMES=(
  "Voice Capture Reliability"
  "Consulting Project Delivery"
  "User Interview Insights"
  "Product Discovery Notes"
  "Engineering Operations"
  "Customer Success Patterns"
  "Quarterly Planning"
  "Experiment Backlog"
  "Knowledge Management Workflow"
  "Retention and Churn Signals"
  "Operational Risk Review"
  "Feature Adoption Trends"
)

ARTIFACTS=(
  "Playbook"
  "Retrospective"
  "Brief"
  "Runbook"
  "Field Notes"
  "Review"
  "Working Session Summary"
  "Decision Log"
  "Implementation Notes"
  "Research Memo"
  "Planning Draft"
  "Status Update"
)

AUDIENCES=(
  "Leadership Team"
  "Product Squad"
  "Engineering Team"
  "Customer Success"
  "Research Group"
  "Operations Team"
  "Growth Team"
  "Advisory Board"
)

OBJECTIVES=(
  "reduce note triage time"
  "improve semantic search quality"
  "shorten capture-to-index latency"
  "increase weekly active usage"
  "reduce duplicate documentation"
  "improve handoff quality across teams"
  "stabilize ingestion throughput"
  "improve discovery of linked context"
)

METRICS=(
  "median capture-to-search latency"
  "7-day active editor rate"
  "weekly linked-note creation count"
  "transcription correction rate"
  "search click-through rate"
  "folder-level document growth"
  "revisit rate of archived notes"
  "tag precision from auto-categorization"
)

CONSTRAINTS=(
  "limited reviewer bandwidth"
  "uneven source quality"
  "high variance in note length"
  "tight release timeline"
  "partial adoption of tagging conventions"
  "inconsistent capture context"
  "legacy naming patterns"
  "intermittent transcription cleanup"
)

WORKSTREAMS=(
  "capture pipeline hardening"
  "folder taxonomy cleanup"
  "semantic indexing calibration"
  "editor workflow simplification"
  "cross-note linking quality"
  "bulk import consistency"
  "search relevance tuning"
  "release-readiness QA"
)

usage() {
  cat <<'EOF'
Usage: scripts/seed_stresstest_data.sh [-n COUNT] [-s SEED]

Creates realistic long markdown documents in the configured Tentacle documents directory.
By default it prompts for COUNT and optional SEED.

Options:
  -n, --count COUNT   Number of documents to generate (positive integer)
  -s, --seed SEED     RNG seed (non-negative integer, default: 1337)
  -h, --help          Show this help message
EOF
}

error() {
  echo "error: $*" >&2
}

is_positive_int() {
  [[ "${1:-}" =~ ^[1-9][0-9]*$ ]]
}

is_non_negative_int() {
  [[ "${1:-}" =~ ^[0-9]+$ ]]
}

pick_from_array() {
  local array_name="$1"
  local size idx
  eval "size=\${#$array_name[@]}"
  if [ "$size" -le 0 ]; then
    printf ''
    return
  fi
  idx=$((RANDOM % size))
  eval "printf '%s' \"\${$array_name[$idx]}\""
}

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//'
}

expand_home_path() {
  local raw_path="$1"
  if [ "$raw_path" = "~" ]; then
    printf '%s' "$HOME"
    return
  fi
  case "$raw_path" in
    "~/"*)
      printf '%s/%s' "$HOME" "${raw_path#~/}"
      ;;
    *)
      printf '%s' "$raw_path"
      ;;
  esac
}

resolve_documents_dir() {
  local config_json raw_value

  if ! command -v tentacle >/dev/null 2>&1; then
    error "tentacle CLI not found. Install it and run 'tentacle init' first."
    exit 1
  fi

  if ! config_json="$(tentacle config get documents_folder --json 2>/dev/null)"; then
    error "unable to read documents_folder from Tentacle config."
    error "run 'tentacle init --json' and then 'tentacle config set documents_folder <path>'."
    exit 1
  fi

  raw_value=""
  if command -v jq >/dev/null 2>&1; then
    raw_value="$(printf '%s\n' "$config_json" | jq -r '.value // empty')"
  else
    raw_value="$(printf '%s\n' "$config_json" | sed -n 's/.*"value"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  fi

  if [ -z "$raw_value" ] || [ "$raw_value" = "null" ]; then
    error "documents_folder is empty or invalid in Tentacle config."
    error "set it with: tentacle config set documents_folder <path>"
    exit 1
  fi

  DOCUMENTS_DIR="$(expand_home_path "$raw_value")"
  mkdir -p "$DOCUMENTS_DIR"
}

generate_title() {
  local theme artifact audience objective variant
  theme="$(pick_from_array THEMES)"
  artifact="$(pick_from_array ARTIFACTS)"
  audience="$(pick_from_array AUDIENCES)"
  objective="$(pick_from_array OBJECTIVES)"
  variant=$((RANDOM % 6))

  case "$variant" in
    0) printf '%s %s for %s' "$theme" "$artifact" "$audience" ;;
    1) printf '%s: %s and %s' "$artifact" "$theme" "$objective" ;;
    2) printf '%s - %s Weekly Review' "$theme" "$artifact" ;;
    3) printf '%s Deep Dive: %s' "$theme" "$artifact" ;;
    4) printf '%s: Constraints, Signals, and Next Moves' "$theme" ;;
    *) printf '%s Notes for %s' "$theme" "$audience" ;;
  esac
}

build_document_body() {
  local title="$1"
  local seed_tag="$2"
  local stream objective metric constraint audience
  local review_window decision_window signal_a signal_b

  stream="$(pick_from_array WORKSTREAMS)"
  objective="$(pick_from_array OBJECTIVES)"
  metric="$(pick_from_array METRICS)"
  constraint="$(pick_from_array CONSTRAINTS)"
  audience="$(pick_from_array AUDIENCES)"

  review_window=$((2 + (RANDOM % 6)))
  decision_window=$((1 + (RANDOM % 4)))
  signal_a=$((40 + (RANDOM % 55)))
  signal_b=$((15 + (RANDOM % 70)))

  cat <<EOF
# $title

## Context
This note captures current observations from the $stream workstream and translates them into practical actions for the $audience.
Over the last $review_window weeks, we focused on signals that directly impact our ability to $objective without adding friction for the capture flow.
The working assumption is that consistency in document structure improves downstream searchability and reduces rework during review cycles.

## What We Observed
Across recent sessions, the strongest pattern was uneven quality between fast capture notes and follow-up edits performed later in the day.
When notes were captured with clearer intent, retrieval quality improved and related entries were easier to connect in search results.
Operationally, the metric that moved most was $metric, while secondary indicators remained noisy due to inconsistent folder discipline.

## Analysis
The evidence suggests the biggest bottleneck is not volume; it is variance in note clarity at the moment of creation.
A narrower drafting pattern with predictable section headers appears to increase semantic overlap between related documents.
In internal testing, notes that included explicit decisions and owner names generated better recall than narrative-only logs.

## Risks and Constraints
The primary execution constraint is $constraint, which limits how quickly reviewers can normalize incoming material.
If we increase throughput without improving structure, we risk a larger backlog of low-value notes that are technically indexed but rarely reused.
There is also a coordination risk when folder naming changes faster than tagging conventions, creating avoidable drift in classification.

## Decisions
We will keep a lightweight long-form template and avoid adding new required metadata fields before release.
We will prioritize actions that reduce ambiguity in headings, ownership, and expected outcomes.
We will monitor $metric weekly and treat sustained movement below $signal_a as a trigger for additional cleanup passes.

## Next Actions
- Align document owners on a shared outline for weekly operational notes.
- Run a focused quality sweep on recently imported notes and correct ambiguous titles.
- Validate that search results for critical queries remain above the $signal_b relevance threshold.
- Reassess this plan in $decision_window weeks and adjust scope only if quality targets are missed.

Reference marker: $seed_tag
EOF
}

choose_folder_for_created_index() {
  local created_index="$1"
  local requested_count="$2"
  local subfolder_count="${#SUBFOLDERS[@]}"
  local subfolder_index

  if [ "$created_index" -eq 0 ]; then
    printf '%s' ""
    return
  fi

  if [ "$created_index" -eq 1 ]; then
    subfolder_index=$((RANDOM % subfolder_count))
    printf '%s' "${SUBFOLDERS[$subfolder_index]}"
    return
  fi

  if [ "$requested_count" -ge $((subfolder_count + 1)) ] \
    && [ "$created_index" -ge 1 ] \
    && [ "$created_index" -le "$subfolder_count" ]; then
    subfolder_index=$((created_index - 1))
    printf '%s' "${SUBFOLDERS[$subfolder_index]}"
    return
  fi

  if [ $((RANDOM % 100)) -lt "$ROOT_TARGET_PERCENT" ]; then
    printf '%s' ""
  else
    subfolder_index=$((RANDOM % subfolder_count))
    printf '%s' "${SUBFOLDERS[$subfolder_index]}"
  fi
}

COUNT=""
SEED=""

while [ $# -gt 0 ]; do
  case "$1" in
    -n|--count)
      if [ $# -lt 2 ]; then
        error "missing value for $1"
        exit 1
      fi
      COUNT="$2"
      shift 2
      ;;
    -s|--seed)
      if [ $# -lt 2 ]; then
        error "missing value for $1"
        exit 1
      fi
      SEED="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      error "unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

if [ -z "$COUNT" ]; then
  if [ -t 0 ]; then
    read -r -p "How many documents should be created? " COUNT
  else
    error "document count is required in non-interactive mode (use --count)."
    exit 1
  fi
fi

if ! is_positive_int "$COUNT"; then
  error "count must be a positive integer."
  exit 1
fi

if [ -z "$SEED" ]; then
  if [ -t 0 ]; then
    read -r -p "Optional seed (press Enter for ${DEFAULT_SEED}): " SEED
    SEED="${SEED:-$DEFAULT_SEED}"
  else
    SEED="$DEFAULT_SEED"
  fi
fi

if ! is_non_negative_int "$SEED"; then
  error "seed must be a non-negative integer."
  exit 1
fi

RANDOM="$SEED"
resolve_documents_dir

ROOT_CREATED=0
SUB_CREATED=0
CREATED=0
SKIPPED_COLLISIONS=0
ATTEMPTS=0
MAX_ATTEMPTS=$((COUNT * MAX_ATTEMPTS_MULTIPLIER))

SUBFOLDER_COUNTS=()
for _ in "${SUBFOLDERS[@]}"; do
  SUBFOLDER_COUNTS+=(0)
done

USED_TITLES_FILE="$(mktemp)"
cleanup() {
  rm -f "$USED_TITLES_FILE"
}
trap cleanup EXIT

while [ "$CREATED" -lt "$COUNT" ] && [ "$ATTEMPTS" -lt "$MAX_ATTEMPTS" ]; do
  ATTEMPTS=$((ATTEMPTS + 1))

  local_title_attempts=0
  title=""
  while [ "$local_title_attempts" -lt 25 ]; do
    local_title_attempts=$((local_title_attempts + 1))
    candidate_title="$(generate_title)"
    if grep -F -x -q "$candidate_title" "$USED_TITLES_FILE"; then
      continue
    fi
    printf '%s\n' "$candidate_title" >> "$USED_TITLES_FILE"
    title="$candidate_title"
    break
  done

  if [ -z "$title" ]; then
    continue
  fi

  target_folder="$(choose_folder_for_created_index "$CREATED" "$COUNT")"
  if [ -n "$target_folder" ]; then
    output_dir="${DOCUMENTS_DIR}/${target_folder}"
  else
    output_dir="$DOCUMENTS_DIR"
  fi
  mkdir -p "$output_dir"

  slug="$(slugify "$title")"
  if [ -z "$slug" ]; then
    slug="untitled-note-$ATTEMPTS-$CREATED"
  fi
  output_path="${output_dir}/${slug}.md"

  if [ -e "$output_path" ]; then
    SKIPPED_COLLISIONS=$((SKIPPED_COLLISIONS + 1))
    continue
  fi

  marker="${SEED}-${ATTEMPTS}-${CREATED}-$((RANDOM % 10000))"
  build_document_body "$title" "$marker" > "$output_path"

  CREATED=$((CREATED + 1))
  if [ -n "$target_folder" ]; then
    SUB_CREATED=$((SUB_CREATED + 1))
    for idx in "${!SUBFOLDERS[@]}"; do
      if [ "${SUBFOLDERS[$idx]}" = "$target_folder" ]; then
        SUBFOLDER_COUNTS[$idx]=$((SUBFOLDER_COUNTS[$idx] + 1))
        break
      fi
    done
  else
    ROOT_CREATED=$((ROOT_CREATED + 1))
  fi
done

echo
echo "Seed stress-test data summary"
echo "  Requested documents: $COUNT"
echo "  Created documents:   $CREATED"
echo "  Skipped collisions:  $SKIPPED_COLLISIONS"
echo "  Attempts used:       $ATTEMPTS / $MAX_ATTEMPTS"
echo "  Documents folder:    $DOCUMENTS_DIR"
echo "  Root documents:      $ROOT_CREATED"
echo "  Subfolder documents: $SUB_CREATED"
echo "  Per-folder counts:"
for idx in "${!SUBFOLDERS[@]}"; do
  echo "    ${SUBFOLDERS[$idx]}: ${SUBFOLDER_COUNTS[$idx]}"
done

if [ "$CREATED" -lt "$COUNT" ]; then
  error "stopped after max attempts; created $CREATED of $COUNT requested documents."
  exit 1
fi
