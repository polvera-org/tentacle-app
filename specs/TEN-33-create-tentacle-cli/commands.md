# Tentacle CLI Commands Specification

**Purpose:** Enable powerusers and AI agents to interact with Tentacle's knowledge management system through the terminal.

**Key Design Principles:**
- All list/search operations return document IDs for subsequent operations
- `--json` flag available on all commands for machine parsing
- Consistent, predictable output formats
- Atomic operations that can be chained

---

## Distribution & Installation

**Strategy:** Pure Rust CLI distributed via `cargo-dist` for zero-friction installation (no Cargo required for end users).

**Installation Methods:**
```bash
# One-line shell installer (primary method)
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/polvera/tentacle/releases/latest/download/tentacle-installer.sh | sh

# Homebrew (macOS/Linux)
brew install tentacle

# Direct download (GitHub Releases)
# Pre-built binaries for macOS (Intel/ARM), Linux, Windows

# Cargo (for Rust developers)
cargo install tentacle
```

**Rationale:** Modern Rust CLIs (ripgrep, bat, starship) use this approach. Provides easy installation without requiring Rust toolchain. npm wrapper can be added later if needed, but starting with cargo-dist keeps the build pipeline simple while still offering one-line installs.

---

## Global Flags

```bash
--json          # Output in JSON format for machine parsing
--help, -h      # Show help for any command
--version, -v   # Show version information
```

---

## System Commands

### `tentacle init`
Initialize Tentacle for first-time use.

```bash
tentacle init
```

**Behavior:**
- Creates necessary directories and configuration files
- Prompts for initial setup (storage location, default folder, etc.)
- Sets up local vector database
- Outputs success message with next steps

**JSON Output:**
```json
{
  "status": "initialized",
  "config_path": "~/.tentacle/config.toml",
  "data_path": "~/.tentacle/data"
}
```

---

### `tentacle config`
View or modify configuration.

```bash
# View all config
tentacle config

# Get specific value
tentacle config get editor
tentacle config get storage_path

# Set specific value
tentacle config set editor "nvim"
tentacle config set default_folder "work"
```

**Configurable Values:**
- `editor` - Editor command for create/edit (default: `vi`)
- `storage_path` - Where documents are stored
- `default_folder` - Default folder for new documents
- `auto_tag` - Enable/disable auto-tagging

**JSON Output:**
```json
{
  "editor": "nvim",
  "storage_path": "/Users/user/.tentacle/data",
  "default_folder": "inbox",
  "auto_tag": true
}
```

---

### `tentacle status`
Show indexing and system statistics.

```bash
tentacle status
```

**Output:**
```
Documents:     1,247
Folders:       8
Tags:          156
Last Indexed:  2 minutes ago
Index Size:    45.2 MB
```

**JSON Output:**
```json
{
  "documents": {
    "total": 1247,
    "by_folder": {
      "work": 523,
      "personal": 412,
      "inbox": 312
    }
  },
  "folders": 8,
  "tags": 156,
  "last_indexed": "2024-02-17T14:32:00Z",
  "index_size_bytes": 47448064
}
```

---

### `tentacle reindex`
Force re-indexing of all documents.

```bash
tentacle reindex

# Reindex specific folder
tentacle reindex --folder work
```

**Output:**
```
Reindexing 1,247 documents...
✓ Completed in 12.4s
```

**JSON Output:**
```json
{
  "status": "completed",
  "documents_indexed": 1247,
  "duration_ms": 12400
}
```

---

## Document Discovery

### `tentacle list`
List all documents with IDs.

```bash
# List all documents
tentacle list

# List documents in specific folder
tentacle list --folder work

# Limit results
tentacle list --limit 20

# Sort options
tentacle list --sort created    # created, modified, title
tentacle list --sort modified --desc
```

**Output:**
```
ID          TITLE                        FOLDER    TAGS                 MODIFIED
doc-abc123  Project Roadmap Q1          work      planning,roadmap     2 days ago
doc-def456  Meeting Notes - Design      work      meetings             1 week ago
doc-ghi789  Personal Goals 2024         personal  goals,reflection     3 weeks ago
```

**JSON Output:**
```json
{
  "documents": [
    {
      "id": "doc-abc123",
      "title": "Project Roadmap Q1",
      "folder": "work",
      "tags": ["planning", "roadmap"],
      "created_at": "2024-01-15T10:30:00Z",
      "modified_at": "2024-02-15T14:22:00Z",
      "size_bytes": 4521
    },
    {
      "id": "doc-def456",
      "title": "Meeting Notes - Design",
      "folder": "work",
      "tags": ["meetings"],
      "created_at": "2024-02-10T09:00:00Z",
      "modified_at": "2024-02-10T11:30:00Z",
      "size_bytes": 2341
    }
  ],
  "total": 1247,
  "showing": 2
}
```

---

### `tentacle search`
Semantic search across documents.

```bash
# Basic search
tentacle search "machine learning implementation"

# With filters
tentacle search "machine learning" --folder work --tags "research,ai"

# Limit results
tentacle search "budget planning" --limit 5

# Show snippets
tentacle search "api design" --snippets
```

**Output:**
```
ID          TITLE                     RELEVANCE  FOLDER    TAGS
doc-abc123  ML Model Architecture     0.94       work      ai,research
doc-xyz789  Training Pipeline Notes   0.87       work      ai,ml
doc-mno345  Data Processing Guide     0.79       work      data,ml
```

**JSON Output:**
```json
{
  "query": "machine learning implementation",
  "results": [
    {
      "id": "doc-abc123",
      "title": "ML Model Architecture",
      "relevance_score": 0.94,
      "folder": "work",
      "tags": ["ai", "research"],
      "snippet": "...our machine learning implementation uses a transformer-based architecture...",
      "matched_chunks": 3
    }
  ],
  "total_results": 3,
  "search_time_ms": 145
}
```

---

## Document Operations

### `tentacle read`
Display document content.

```bash
# Read full document
tentacle read doc-abc123

# Read with metadata
tentacle read doc-abc123 --metadata
```

**Output:**
```
Project Roadmap Q1
==================
Folder: work
Tags: planning, roadmap
Modified: 2024-02-15

[Document content here...]
```

**JSON Output:**
```json
{
  "id": "doc-abc123",
  "title": "Project Roadmap Q1",
  "folder": "work",
  "tags": ["planning", "roadmap"],
  "created_at": "2024-01-15T10:30:00Z",
  "modified_at": "2024-02-15T14:22:00Z",
  "content": "[Full markdown content here...]",
  "size_bytes": 4521
}
```

---

### `tentacle create`
Create new document in configured editor.

```bash
# Create with defaults
tentacle create

# Create in specific folder
tentacle create --folder work

# Create with title and tags
tentacle create --title "Meeting Notes" --tags "meetings,team"

# Create from stdin (for AI agents)
echo "# My Document\n\nContent here" | tentacle create --folder work --title "Auto Created"
```

**Behavior:**
- Opens configured editor (default: vi)
- On save, creates document and indexes it
- Returns document ID for subsequent operations

**JSON Output:**
```json
{
  "id": "doc-new123",
  "title": "Meeting Notes",
  "folder": "work",
  "tags": ["meetings", "team"],
  "created_at": "2024-02-17T15:45:00Z"
}
```

---

### `tentacle edit`
Edit existing document in configured editor.

```bash
tentacle edit doc-abc123
```

**Behavior:**
- Opens document in configured editor
- On save, updates document and re-indexes
- Returns updated metadata

**JSON Output:**
```json
{
  "id": "doc-abc123",
  "modified_at": "2024-02-17T15:50:00Z",
  "status": "updated"
}
```

---

### `tentacle import`
Import document from filesystem.

```bash
# Import single file
tentacle import ~/Documents/notes.md

# Import to specific folder
tentacle import ~/Documents/notes.md --folder work

# Import with tags
tentacle import ~/Documents/notes.md --folder work --tags "imported,archive"

# Preserve filename as title
tentacle import ~/Documents/Q1-roadmap.md --title "Q1 Roadmap"
```

**JSON Output:**
```json
{
  "id": "doc-imp123",
  "title": "notes",
  "original_path": "/Users/user/Documents/notes.md",
  "folder": "work",
  "tags": ["imported", "archive"],
  "imported_at": "2024-02-17T16:00:00Z",
  "size_bytes": 3421
}
```

---

### `tentacle export`
Export document to filesystem.

```bash
# Export single document
tentacle export doc-abc123 ~/Desktop/exported.md

# Export with original formatting
tentacle export doc-abc123 ~/Desktop/export.md --format markdown

# Export all documents in folder
tentacle export --folder work ~/Desktop/work-docs/
```

**JSON Output:**
```json
{
  "id": "doc-abc123",
  "exported_to": "/Users/user/Desktop/exported.md",
  "format": "markdown",
  "size_bytes": 4521
}
```

---

### `tentacle delete`
Delete document permanently.

```bash
# Delete with confirmation prompt
tentacle delete doc-abc123

# Force delete (no prompt)
tentacle delete doc-abc123 --force
```

**Output:**
```
Delete document "Project Roadmap Q1"? (y/n): y
✓ Document deleted
```

**JSON Output:**
```json
{
  "id": "doc-abc123",
  "status": "deleted",
  "deleted_at": "2024-02-17T16:15:00Z"
}
```

---

## Organization Commands

### `tentacle tag`
Manage document tags.

```bash
# Add tags (merges with existing)
tentacle tag doc-abc123 "planning,q1,important"

# Remove specific tags
tentacle tag --remove doc-abc123 "important,archive"

# Replace all tags
tentacle tag --replace doc-abc123 "new,tags,only"

# Show document tags
tentacle tag doc-abc123
```

**JSON Output:**
```json
{
  "id": "doc-abc123",
  "tags": ["planning", "q1", "important"],
  "tags_added": ["important"],
  "tags_removed": []
}
```

---

### `tentacle folder list`
List all folders.

```bash
tentacle folder list
```

**Output:**
```
NAME        DOCUMENTS  CREATED
work        523        3 months ago
personal    412        6 months ago
inbox       312        1 week ago
```

**JSON Output:**
```json
{
  "folders": [
    {
      "name": "work",
      "document_count": 523,
      "created_at": "2023-11-17T10:00:00Z"
    },
    {
      "name": "personal",
      "document_count": 412,
      "created_at": "2023-08-17T10:00:00Z"
    }
  ]
}
```

---

### `tentacle folder create`
Create new folder.

```bash
tentacle folder create research
```

**JSON Output:**
```json
{
  "name": "research",
  "created_at": "2024-02-17T16:30:00Z"
}
```

---

### `tentacle folder delete`
Delete folder (moves documents to inbox).

```bash
# Delete with confirmation
tentacle folder delete research

# Force delete
tentacle folder delete research --force
```

**Output:**
```
Delete folder "research"? 15 documents will be moved to inbox. (y/n): y
✓ Folder deleted, 15 documents moved to inbox
```

**JSON Output:**
```json
{
  "name": "research",
  "status": "deleted",
  "documents_moved": 15,
  "moved_to": "inbox"
}
```

---

### `tentacle folder rename`
Rename existing folder.

```bash
tentacle folder rename old-name new-name
```

**JSON Output:**
```json
{
  "old_name": "old-name",
  "new_name": "new-name",
  "document_count": 42
}
```

---

## AI Agent Integration Examples

### Example: Search and Tag Workflow
```bash
# Search for documents
results=$(tentacle search "api documentation" --json)

# Extract first document ID
doc_id=$(echo $results | jq -r '.results[0].id')

# Read and process
tentacle read $doc_id --json | jq -r '.content'

# Add tags based on analysis
tentacle tag $doc_id "api,documentation,reviewed" --json
```

### Example: Bulk Import and Organize
```bash
# Import multiple files
for file in ~/notes/*.md; do
  tentacle import "$file" --folder imported --json
done

# List and review
tentacle list --folder imported --json | jq -r '.documents[].id'
```

### Example: Content Analysis Pipeline
```bash
# Search for untagged documents
tentacle list --json | \
  jq -r '.documents[] | select(.tags | length == 0) | .id' | \
  while read doc_id; do
    # AI agent analyzes content and adds tags
    content=$(tentacle read $doc_id --json | jq -r '.content')
    # ... AI processing ...
    tentacle tag $doc_id "auto-tagged,processed"
  done
```

---

## Error Handling

All commands return appropriate exit codes:
- `0` - Success
- `1` - General error
- `2` - Document not found
- `3` - Folder not found
- `4` - Invalid arguments
- `5` - Permission denied

JSON error output format:
```json
{
  "error": {
    "code": "document_not_found",
    "message": "Document with ID 'doc-abc123' not found",
    "suggestion": "Use 'tentacle list' to see available documents"
  }
}
```

---

## Output Format Consistency

### Date/Time Format
- Human-readable: "2 days ago", "3 weeks ago"
- JSON: ISO 8601 format (`2024-02-17T16:30:00Z`)

### Document IDs
- Format: `doc-{hash}` (e.g., `doc-abc123`)
- Stable across renames/edits
- Guaranteed unique

### Size Display
- Human-readable: "45.2 MB", "3.4 KB"
- JSON: bytes as integer

---

## Configuration File

Default location: `~/.tentacle/config.toml`

```toml
[general]
editor = "vi"
default_folder = "inbox"
auto_tag = true

[storage]
data_path = "~/.tentacle/data"
max_document_size_mb = 10

[search]
default_limit = 20
snippet_length = 200

[ai]
auto_summarize = false
embedding_model = "all-MiniLM-L6-v2"
```
