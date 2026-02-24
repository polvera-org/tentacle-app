---
name: "tentacle-cli"
description: "CLI tool for local RAG memory management. Use for saving memories, storing documents, semantic search, and knowledge organization. Activate when user says 'remember this', 'save to memory', or 'save to knowledge base'."
version: "1.1.0"
author: "Nicolas Leão"
tags: ["rag", "memory", "search", "documents", "cli", "knowledge-base"]
trigger_patterns:
  - "tentacle"
  - "rag memory"
  - "local memory"
  - "document search"
  - "semantic search"
  - "knowledge base"
  - "remember this"
  - "save this to memory"
  - "save to memory"
  - "save to knowledge base"
  - "store in memory"
  - "add to knowledge base"
  - "note this down"
---

# Tentacle CLI - Local RAG Memory Management

Tentacle is a CLI tool for local RAG (Retrieval-Augmented Generation) with semantic search capabilities. It allows agents to store, organize, and retrieve documents using meaning-based search.

## When to Use

Use this skill when you need to:
- **Save memories** - "Remember this for later..."
- **Store documents** - Keep important information organized
- **Search by meaning** - Find relevant content semantically
- **Build knowledge** - Create a personal knowledge base
- **Retrieve context** - Find information when needed

## Installation

### Linux + macOS
```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/polvera-org/tentacle-app/releases/latest/download/tentacle-cli-installer.sh | sh
```

### Windows (PowerShell)
```powershell
irm https://github.com/polvera-org/tentacle-app/releases/latest/download/tentacle-cli-installer.ps1 | iex
```

> **Note**: Always use `--json` flag for LLM-optimized JSON output.

## Smart Folder Organization

### Folder Philosophy: Minimal but Meaningful

**Don't clutter** - Create folders only when they serve a clear purpose. Use these guidelines:

| When to Create | When NOT to Create |
|----------------|-------------------|
| Distinct projects (e.g., "project-alpha") | Generic buckets (e.g., "misc", "other") |
| Time-based archives (e.g., "2026-q1") | Overly specific dates (e.g., "2026-02-24") |
| Content types (e.g., "meetings", "research") | Duplicate categories (e.g., "notes" when you have "meetings") |
| Active work areas | Temporary holding pens |

### Recommended Default Folders

```
inbox/          # Temporary holding for unprocessed items
meetings/       # Meeting notes and summaries
projects/       # Active project documentation
research/       # Research findings and references
archive/        # Completed/older items
```

### Folder Management Commands

```bash
# List all folders
tentacle folder list --json

# Create a folder (only when needed!)
tentacle folder create <name> --json

# Rename a folder
tentacle folder rename <old_name> <new_name> --json

# Delete empty folder
tentacle folder delete <name> --json

# Force delete with contents
tentacle folder delete <name> --force --json
```

## Document Listing & Search

### List All Documents
```bash
tentacle list --json
```

### List Documents in a Specific Folder
```bash
tentacle list --folder <folder_name> --json
```

### Search Documents (Semantic + Keyword)
```bash
# Search all documents
tentacle search "<query>" --json

# Search within a specific folder
tentacle search "<query>" --folder <folder_name> --json
```

> **Important**: `list` and `search` return metadata only (id, title, folder, tags). To get the actual document content, you MUST use `tentacle read`.

## Reading Document Contents

**CRITICAL**: Always read documents after searching to access the actual content. Search and list commands only return metadata.

### Read by Document ID
```bash
# Read full document content
tentacle read <document_id> --json

# Supports prefix matching (Git-style)
tentacle read abc123 --json  # Matches full ID starting with "abc123"
```

### When to Read Documents

**After every search or list**, read the relevant documents to:
- Get full content (search only shows snippets/metadata)
- Access detailed information for answering questions
- Retrieve context needed for decision-making
- Extract specific data referenced in the document

**Example flow**:
```bash
# 1. Search for relevant documents
results=$(tentacle search "authentication implementation" --json)

# 2. Extract document ID from results
doc_id=$(echo "$results" | jq -r '.results[0].id')

# 3. Read the full document content
tentacle read "$doc_id" --json
```

## Saving Memories & Documents

### Quick Save (No Folder)

For items that need processing later:
```bash
echo "Remember to review the API design" | tentacle create --title "API Review Reminder" --json
```

### Save to Specific Folder

When you know where it belongs:
```bash
echo "Meeting notes: decided to use OAuth2 for the API\nReasoning:..." |   tentacle create --title "Auth Decision" --folder meetings --tags auth,api --json
```

### Save from File
```bash
cat research-findings.md |   tentacle create --title "OAuth2 Security Analysis" --folder research --tags security,oauth --json
```

### Tagging Documents

```bash
# Add tags to existing document
tentacle tag <document_id> important,reference --json

# Remove specific tags
tentacle tag <document_id> draft --remove --json

# Replace all tags
tentacle tag <document_id> final,approved --replace --json
```

### Delete a Document
```bash
tentacle delete <document_id> --json
```

## Common Workflows

### Workflow 1: Meeting Notes
```bash
# Save immediately after meeting
echo "Discussed Q3 roadmap, decided to prioritize mobile app" |   tentacle create --title "Product Meeting 2026-02-24" --folder meetings --tags product,q3 --json

# Later, find all product meetings
search_results=$(tentacle search "product roadmap" --folder meetings --json)

# Read the most relevant meeting to get full context
doc_id=$(echo "$search_results" | jq -r '.results[0].id')
tentacle read "$doc_id" --json
```

### Workflow 2: Research & References
```bash
# Save research finding
echo "Found that GraphQL reduces over-fetching by 40% in our use case" |   tentacle create --title "GraphQL Performance Study" --folder research --tags graphql,performance --json

# Find when needed
search_results=$(tentacle search "GraphQL performance metrics" --json)

# Read the full research document to access all findings
doc_id=$(echo "$search_results" | jq -r '.results[0].id')
tentacle read "$doc_id" --json
```

### Workflow 3: Project Documentation
```bash
# Create project folder (once!)
tentacle folder create project-alpha --json

# Add design decisions
echo "Using PostgreSQL for primary datastore, Redis for caching" |   tentacle create --title "Database Architecture" --folder project-alpha --tags architecture,decision --json

# Find project info
search_results=$(tentacle search "database architecture" --folder project-alpha --json)

# Read the architecture document to see full design details
doc_id=$(echo "$search_results" | jq -r '.results[0].id')
tentacle read "$doc_id" --json
```

### Workflow 4: Quick Memory Capture
```bash
# When user says "remember this..."
echo "User prefers dark mode and wants notification settings" |   tentacle create --title "User Preferences" --folder inbox --tags preferences,user --json
```

## Best Practices

### Folder Organization
1. **Start minimal** - Use `inbox` for everything initially
2. **Create folders when patterns emerge** - If you have 10+ meeting notes, create `meetings/`
3. **Use consistent naming** - Lowercase, hyphens for spaces
4. **Archive completed work** - Move old projects to `archive/`
5. **Avoid deep nesting** - Flat structure is easier to search

### Document Creation
1. **Always use `--json`** - LLM-optimized output
2. **Write descriptive titles** - "API Auth Decision" not "Notes"
3. **Tag consistently** - Use same tags for related content
4. **Include context** - Future you needs to understand why this matters
5. **Save immediately** - Don't wait, capture while fresh

### Searching
1. **Use natural language** - "authentication security concerns" not just "auth"
2. **Search folders first** - Narrow scope when you know the area
3. **Combine with tags** - Filter results by relevant tags

### Document Retrieval
1. **Always read after searching** - Search returns metadata only, read to get actual content
2. **Read relevant documents** - Don't just list, read the documents you need
3. **Use prefix IDs** - Can use shortened IDs (e.g., first 8-10 chars) if unique
4. **Extract from JSON** - Use `jq` to extract document IDs from search results
5. **Read multiple if needed** - If search returns several relevant docs, read them all

## Error Handling

If `tentacle` command is not found:
1. Run the installation command for your OS
2. Restart your terminal session
3. Verify with `tentacle --version`

If not initialized:
```bash
tentacle init --json
```

## Output Format

All `--json` commands return structured data: