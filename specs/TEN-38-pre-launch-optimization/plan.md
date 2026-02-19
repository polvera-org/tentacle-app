# Reindexing Performance Optimization Plan

## Executive Summary

Current reindexing performance is **2-3 seconds per document**, which is problematic for reindexing thousands of files. The primary bottleneck is **sequential chunk embedding** with excessive mutex contention and database writes. Implementing the optimizations below could reduce reindex time from **hours to minutes** for large document collections.

## Current Architecture Analysis

### Data Flow
1. Load documents from filesystem (sequential, one at a time)
2. For each document:
   - Compute content hash
   - Check if changed
   - If changed:
     - Embed full document text (1 embedding call)
     - Chunk document into ~800 char pieces with 200 char overlap
     - Embed each chunk sequentially (N embedding calls for N chunks)
     - Write embeddings to database
3. Each embedding call:
   - Acquires mutex lock on embedding engine
   - Tokenizes input
   - Runs ONNX inference
   - Releases mutex

### Performance Bottleneck Example
- 1000 documents with average 10 chunks each = 10,000 chunks
- Current: 10,000+ sequential embedding calls + 10,000+ mutex acquisitions + 10,000+ DB writes
- Optimized: ~313 batched embedding calls + 313 mutex acquisitions + 20 DB transactions

---

## Critical Bottlenecks

### 1. Sequential Chunk Embedding ⚠️ **HIGHEST IMPACT**

**Location:** `core/src/embeddings.rs:898-909`

**Problem:**
- Each document is split into multiple chunks (~800 chars each)
- Each chunk is embedded individually in a for loop
- A 10,000 character document creates ~13 separate embedding calls
- Each call acquires and releases the mutex

**Code:**
```rust
for chunk in chunks {
    let vector = embed_document_text(&chunk.text)?;  // Sequential!
    chunk_payloads.push(...);
}
```

**Impact:** For documents with many chunks, this is the dominant cost.

---

### 2. Sequential Document Processing

**Location:** `core/src/embeddings.rs:938-958`

**Problem:**
- Documents are processed one at a time in a for loop
- No parallelization or pipelining
- Next document waits for previous document to complete entirely

**Code:**
```rust
for (index, document) in documents.iter().enumerate() {
    match sync_document_embeddings(store, document, Some(&metadata_lookup)) {
        Ok(()) => synced_count += 1,
        // ...
    }
}
```

**Impact:** Underutilizes CPU and I/O during sequential processing.

---

### 3. Mutex Contention on Embedding Engine

**Location:** `core/src/embeddings.rs:750-757`

**Problem:**
- Every embedding call acquires the global mutex
- Mutex is released after each call
- No batching = excessive lock/unlock overhead

**Code:**
```rust
fn embed_document_text(text: &str) -> Result<Vec<f32>, EmbeddingError> {
    let engine = EmbeddingEngine::engine()?;
    let mut engine = engine.lock().map_err(|_| EmbeddingError::EnginePoisoned)?;
    engine.embed_text(text)  // Lock held for one embedding only
}
```

**Impact:** Lock contention becomes bottleneck with high call frequency.

---

### 4. Individual File I/O Operations

**Location:** `core/src/knowledge_base.rs:319-344`

**Problem:**
- Documents are read from disk one at a time
- Sequential file reads with no prefetching
- No parallelization of I/O operations

**Code:**
```rust
for document in listed_documents {
    let full_document = match document_store::read_document(documents_folder, &document.id) {
        Ok(document) => document,
        // ...
    };
    cached_documents.push(...);
}
```

**Impact:** I/O bound operations serialize the entire pipeline.

---

### 5. Database Transaction Overhead

**Location:** `core/src/embeddings.rs:838-844`, `911`

**Problem:**
- Each document's embeddings written individually
- Potential separate transaction per document
- No batching of database writes

**Code:**
```rust
store.upsert_document_embedding(&CachedDocumentEmbeddingPayload { ... })?;
// Later...
store.replace_document_chunk_embeddings(&document.id, &chunk_payloads)?;
```

**Impact:** Transaction overhead multiplied by number of documents.

---

### 6. No Batch-Level Hash Filtering

**Location:** `core/src/embeddings.rs:827-845`

**Problem:**
- Content hash checking happens during embedding
- Documents are still processed one-by-one to check hashes
- No upfront filtering of unchanged documents

**Impact:** Wastes time checking hashes sequentially for unchanged documents.

---

## Optimization Recommendations

### Optimization 1: Batch Chunk Embeddings 🔥 **HIGHEST PRIORITY**

**Goal:** Embed multiple chunks together to reduce mutex contention and improve throughput.

**Changes:**
1. Add new function to `core/src/embeddings.rs`:
   ```rust
   pub fn embed_texts_batch(texts: &[&str]) -> Result<Vec<Vec<f32>>, EmbeddingError>
   ```

2. Modify `sync_document_embeddings` to collect chunks and embed in batches:
   - Collect all chunk texts for a document
   - Call `embed_texts_batch` with all chunks at once
   - Hold mutex for entire batch instead of per-chunk

3. Consider cross-document batching:
   - Collect chunks from multiple documents (32-64 chunks)
   - Embed all together
   - Distribute results back to documents

**Expected Impact:** 10-50x speedup for chunk embedding phase

**Complexity:** Medium (requires refactoring embedding flow)

---

### Optimization 2: Batch Database Writes 🔥 **HIGH PRIORITY**

**Goal:** Reduce database transaction overhead by batching writes.

**Changes:**
1. Add `begin_transaction()` / `commit()` support to `DocumentCacheStore`

2. Modify `sync_documents_embeddings_batch_with_progress`:
   - Collect all embedding payloads (both document and chunk embeddings)
   - Write in batches of 50-100 documents
   - Use explicit transactions

3. Example structure:
   ```rust
   store.begin_transaction()?;
   for batch in documents.chunks(50) {
       for doc in batch {
           let embeddings = compute_embeddings(doc);
           payloads.push(embeddings);
       }
       for payload in payloads {
           store.upsert_document_embedding(&payload)?;
           store.replace_document_chunk_embeddings(&payload.id, &payload.chunks)?;
       }
   }
   store.commit()?;
   ```

**Expected Impact:** 2-5x speedup on database operations

**Complexity:** Low-Medium

---

### Optimization 3: Parallel Document Loading

**Goal:** Load documents from disk concurrently while processing embeddings.

**Changes:**
1. Use `rayon` to parallelize file reads in `load_cached_documents_with_progress`

2. Example:
   ```rust
   use rayon::prelude::*;

   let cached_documents: Vec<_> = listed_documents
       .par_iter()
       .filter(|doc| folder_matches_filter(&doc.folder_path, folder_filter))
       .filter_map(|document| {
           document_store::read_document(documents_folder, &document.id).ok()
       })
       .collect();
   ```

3. Consider pipeline architecture:
   - Load batch N+1 while processing batch N
   - Use channels to pass loaded documents to embedding thread

**Expected Impact:** 2-3x speedup on document loading phase

**Complexity:** Medium (need to handle progress reporting carefully)

---

### Optimization 4: Pre-filter Unchanged Documents

**Goal:** Skip unchanged documents before starting expensive embedding operations.

**Changes:**
1. In `sync_documents_embeddings_batch_with_progress`:
   - Build metadata lookup for all documents upfront (already done)
   - Pre-filter documents by content hash before embedding loop
   - Only process documents with changed hashes

2. Example:
   ```rust
   let documents_to_embed: Vec<_> = documents
       .iter()
       .filter(|doc| {
           let hash = compute_document_content_hash(&build_source_text(doc));
           metadata_lookup.get(&doc.id)
               .map(|m| m.content_hash != hash)
               .unwrap_or(true)
       })
       .collect();

   // Only process documents_to_embed
   ```

**Expected Impact:** Variable (depends on how many documents are unchanged)
- Full reindex: No impact
- Incremental reindex: 10-100x speedup

**Complexity:** Low

---

### Optimization 5: Reduce Mutex Contention

**Goal:** Hold mutex for longer periods during batch operations.

**Changes:**
1. Modify embedding functions to accept batches and hold mutex once:
   ```rust
   fn embed_texts_batch_internal(engine: &mut EmbeddingEngine, texts: &[&str]) -> Result<Vec<Vec<f32>>>
   ```

2. Acquire mutex once per batch instead of per text:
   ```rust
   let engine = EmbeddingEngine::engine()?;
   let mut engine = engine.lock()?;

   let results = texts.chunks(32)
       .map(|batch| batch.iter().map(|t| engine.embed_text(t)).collect())
       .collect();
   ```

3. Alternative: Consider multiple embedding engine instances in a pool (memory intensive)

**Expected Impact:** 2-5x speedup by reducing lock contention

**Complexity:** Low-Medium

---

### Optimization 6: Optimize Database Schema/Indices

**Goal:** Ensure database operations are as fast as possible.

**Changes:**
1. Check `document_cache.rs` for proper indices on:
   - `document_id` for embedding lookups
   - `content_hash` for quick hash comparisons

2. Consider using `PRAGMA synchronous = NORMAL` during bulk operations:
   ```rust
   store.execute("PRAGMA synchronous = NORMAL")?;
   // ... bulk operations ...
   store.execute("PRAGMA synchronous = FULL")?;
   ```

3. Use prepared statements for repeated queries

**Expected Impact:** 1.5-2x speedup on DB operations

**Complexity:** Low

---

## Implementation Priority

### Phase 1: Quick Wins (Highest ROI)
1. **Batch chunk embeddings** (Optimization 1)
   - Modify `sync_document_embeddings` to batch chunk embedding
   - Add `embed_texts_batch` function
   - Hold mutex for entire document's chunks

2. **Batch database writes** (Optimization 2)
   - Add transaction support
   - Batch writes in groups of 50-100 documents

3. **Pre-filter unchanged documents** (Optimization 4)
   - Quick filter before embedding loop
   - Skip documents with matching hashes

**Expected Combined Impact:** 10-20x speedup

---

### Phase 2: Architectural Improvements
4. **Reduce mutex contention** (Optimization 5)
   - Refactor to hold mutex longer during batches
   - Consider embedding engine pool

5. **Parallel document loading** (Optimization 3)
   - Use rayon for parallel file I/O
   - Implement pipeline architecture

**Expected Combined Impact:** Additional 2-4x speedup

---

### Phase 3: Fine-tuning
6. **Database optimizations** (Optimization 6)
   - Verify indices
   - Tune SQLite pragmas
   - Profile query performance

**Expected Combined Impact:** Additional 1.5-2x speedup

---

## Expected Performance Outcomes

### Current Performance
- **Per Document:** 2-3 seconds (with chunks)
- **1000 Documents:** 33-50 minutes
- **10,000 Documents:** 5.5-8.3 hours

### After Phase 1 Optimizations
- **Per Document:** 0.2-0.3 seconds
- **1000 Documents:** 3-5 minutes
- **10,000 Documents:** 30-50 minutes

### After Phase 2 Optimizations
- **Per Document:** 0.05-0.1 seconds
- **1000 Documents:** 1-2 minutes
- **10,000 Documents:** 10-20 minutes

### After All Optimizations
- **Per Document:** 0.03-0.05 seconds
- **1000 Documents:** 30-60 seconds
- **10,000 Documents:** 5-10 minutes

**Overall Expected Improvement:** 30-50x faster for large reindexing operations

---

## Implementation Notes

### Testing Strategy
1. Create benchmark suite with various document sizes:
   - Small: 100 documents
   - Medium: 1,000 documents
   - Large: 10,000 documents

2. Profile each optimization individually to measure impact

3. Test with:
   - All new documents (worst case)
   - All unchanged documents (best case for hash filtering)
   - 50/50 mix (typical case)

### Compatibility Considerations
- Maintain backward compatibility with existing cache format
- Keep progress reporting API stable for CLI and frontend
- Ensure error handling remains robust during batch operations

### Risk Mitigation
- Implement batching with configurable batch sizes
- Add fallback to sequential mode if batching fails
- Maintain transaction rollback on errors
- Keep memory usage bounded (don't load all documents into memory at once)

---

## Quick Win Implementation Example

Here's a concrete example of the highest-impact optimization:

```rust
// New function in core/src/embeddings.rs
pub fn embed_texts_batch(texts: &[&str]) -> Result<Vec<Vec<f32>>, EmbeddingError> {
    let engine = EmbeddingEngine::engine()?;
    let mut engine = engine.lock().map_err(|_| EmbeddingError::EnginePoisoned)?;

    let mut results = Vec::with_capacity(texts.len());
    for text in texts {
        results.push(engine.embed_text(text)?);
    }
    Ok(results)
}

// Modified sync_document_embeddings in core/src/embeddings.rs
pub fn sync_document_embeddings(
    store: &mut DocumentCacheStore,
    document: &EmbeddingSyncDocumentPayload,
    metadata_lookup: Option<&HashMap<String, CachedDocumentEmbeddingMetadataPayload>>,
) -> Result<(), EmbeddingError> {
    // ... existing document embedding code ...

    let plain_body = extract_plain_text_from_tiptap_or_raw(&document.body);
    let chunks = chunk_document_text(&document.title, &plain_body);

    // Collect all chunk texts
    let chunk_texts: Vec<&str> = chunks.iter().map(|c| c.text.as_str()).collect();

    // Check if chunks need updating
    let combined_hash = compute_chunk_content_hash(&chunk_texts.iter().map(|s| s.to_string()).collect::<Vec<_>>());
    let existing_chunk_hash = store.get_document_chunk_embedding_content_hash(&document.id, LOCAL_EMBEDDING_MODEL_ID)?;

    if existing_chunk_hash.as_deref() == Some(combined_hash.as_str()) {
        log::info!("[embedding-sync] skip chunk embeddings for \"{}\" (hash unchanged)", document.id);
        return Ok(());
    }

    // Embed all chunks in one batch (holds mutex once)
    let chunk_vectors = embed_texts_batch(&chunk_texts)?;

    // Build payloads
    let mut chunk_payloads: Vec<CachedDocumentChunkEmbeddingPayload> = Vec::with_capacity(chunks.len());
    for (chunk, vector) in chunks.into_iter().zip(chunk_vectors.into_iter()) {
        chunk_payloads.push(CachedDocumentChunkEmbeddingPayload {
            document_id: document.id.clone(),
            chunk_index: chunk.index,
            chunk_text: chunk.text,
            content_hash: combined_hash.clone(),
            model: LOCAL_EMBEDDING_MODEL_ID.to_owned(),
            vector,
            updated_at: document.updated_at.clone(),
        });
    }

    store.replace_document_chunk_embeddings(&document.id, &chunk_payloads)?;
    Ok(())
}
```

This single change could provide 10-20x speedup immediately.

---

## Next Steps

1. **Measure Current Performance**
   - Run benchmark with 100, 1000 documents
   - Profile to confirm bottlenecks
   - Establish baseline metrics

2. **Implement Phase 1**
   - Start with batch chunk embeddings
   - Add batch database writes
   - Add hash pre-filtering

3. **Measure After Phase 1**
   - Verify expected improvements
   - Identify remaining bottlenecks

4. **Iterate to Phase 2 and 3**
   - Implement based on profiling results
   - Optimize most impactful remaining bottlenecks
