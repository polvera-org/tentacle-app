# TEN-38 Reindex Pre-Launch Optimization Plan

## Goal

Cut reindex runtime by removing avoidable embedding work and serial bottlenecks while preserving current command behavior and output contracts.

## Steps

1. **Add batched embedding primitives** — reduce lock overhead in the embedding engine path. Introduce a batch embedding entry point and route existing single-text helpers through it so chunk embedding can stop re-locking the engine for every chunk.
2. **Split per-document compute from persistence** — make embedding computation reusable for batch workflows. Refactor the per-document sync logic so it can prepare document/chunk updates without writing immediately, enabling later batch persistence.
3. **Add batch DB write and bulk hash lookup APIs** — reduce SQLite transaction overhead and repeated hash queries. Add cache-store APIs that commit many embedding updates in one transaction and fetch chunk hashes for all documents in one pass.
4. **Refactor Phase 2 reindex orchestration** — skip unchanged documents before expensive work and persist changed documents in batches. Update the main embedding sync loop to pre-filter by content hashes, process bounded batches, and keep progress/result reporting compatible.
5. **Parallelize Phase 1 document loading** — remove serialized file I/O from reindex startup. Use parallel reads for document loading while preserving filter behavior, warning semantics, deterministic final ordering, and progress events.
6. **Finalize validation and benchmark notes** — lock in quality and verify measurable impact. Expand tests for batch behavior and contract stability, run full checks, and record performance smoke results in a benchmark notes file.

## Acceptance Criteria

- [ ] Batched embedding path: `core/src/embeddings.rs` exposes `embed_texts_batch` and chunk embeddings no longer lock the engine once per chunk.
- [ ] Compute/write separation: per-document embedding sync can prepare optional document and chunk updates before DB writes.
- [ ] Transactional batch persistence: `core/src/document_cache.rs` includes a batch embedding write API with atomic rollback behavior on failure.
- [ ] Bulk chunk-hash prefiltering: chunk embedding hashes can be loaded in one query and are used to skip unchanged documents in Phase 2.
- [ ] Batched Phase 2 sync loop: changed documents are processed in bounded batches, progress events still fire correctly, and skip/failure accounting remains coherent.
- [ ] Parallel Phase 1 reads: `load_cached_documents_with_progress` reads candidate files concurrently and still returns deterministic sorting.
- [ ] Quality gates: `cargo check -p tentacle-core`, `cargo test -p tentacle-core`, and `cargo test -p tentacle-cli --test agent_cli_flows` pass.
- [ ] Performance record: `specs/TEN-38-pre-launch-optimization/benchmark-notes.md` captures reindex timing smoke results and commands used.
