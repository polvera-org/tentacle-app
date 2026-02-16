use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use tentacle_core::config::ConfigStore;
use tentacle_core::document_cache::{
    CachedDocumentChunkEmbeddingPayload, CachedDocumentEmbeddingMetadataPayload,
    CachedDocumentEmbeddingPayload, CachedDocumentPayload, CachedDocumentTagPayload,
    DocumentCacheStore, HybridSearchHitPayload, SemanticSearchHitPayload,
};
use tentacle_core::document_folders::{
    DeleteDocumentFolderInputPayload, DocumentFolderPayload, DocumentFoldersService,
    MoveDocumentResultPayload, RenameDocumentFolderInputPayload,
};
use tentacle_core::embeddings::{
    delete_document_embeddings as delete_document_embeddings_in_core,
    hybrid_search_documents_by_query as hybrid_search_documents_by_query_in_core,
    preload_embedding_model as preload_embedding_model_in_core,
    sync_document_embeddings as sync_document_embeddings_in_core,
    sync_documents_embeddings_batch as sync_documents_embeddings_batch_in_core,
    EmbeddingBatchSyncResultPayload, EmbeddingModelLoadStatePayload, EmbeddingSyncDocumentPayload,
};

const EMBEDDING_MODEL_LOAD_EVENT: &str = "embedding-model-load-state";

#[derive(Clone)]
struct EmbeddingRuntimeState {
    load_state: Arc<Mutex<EmbeddingModelLoadStatePayload>>,
    preload_inflight: Arc<AtomicBool>,
}

impl EmbeddingRuntimeState {
    fn new() -> Self {
        Self {
            load_state: Arc::new(Mutex::new(EmbeddingModelLoadStatePayload::default())),
            preload_inflight: Arc::new(AtomicBool::new(false)),
        }
    }

    fn snapshot(&self) -> Result<EmbeddingModelLoadStatePayload, String> {
        let state = self.load_state.lock().map_err(|err| err.to_string())?;
        Ok(state.clone())
    }

    fn set_load_state(&self, next_state: EmbeddingModelLoadStatePayload) -> Result<(), String> {
        let mut state = self.load_state.lock().map_err(|err| err.to_string())?;
        *state = next_state;
        Ok(())
    }
}

fn emit_embedding_model_load_state(
    app_handle: &tauri::AppHandle,
    state: &EmbeddingModelLoadStatePayload,
) {
    if let Err(error) = app_handle.emit(EMBEDDING_MODEL_LOAD_EVENT, state) {
        log::debug!(
            "[embeddings][startup] failed to emit {} event: {}",
            EMBEDDING_MODEL_LOAD_EVENT,
            error
        );
    }
}

fn spawn_embedding_model_preload(app_handle: tauri::AppHandle, runtime: EmbeddingRuntimeState) {
    if runtime.preload_inflight.swap(true, Ordering::SeqCst) {
        log::debug!("[embeddings][startup] preload already running; skipping duplicate request");
        return;
    }

    std::thread::spawn(move || {
        let runtime_for_progress = runtime.clone();
        let app_handle_for_progress = app_handle.clone();
        let preload_result = preload_embedding_model_in_core(|next_state| {
            if let Err(error) = runtime_for_progress.set_load_state(next_state.clone()) {
                log::error!(
                    "[embeddings][startup] failed to update in-memory model load state: {}",
                    error
                );
            }
            emit_embedding_model_load_state(&app_handle_for_progress, &next_state);
        });

        if let Err(error) = preload_result {
            log::error!("[embeddings][startup] preload failed: {}", error);
        }

        runtime.preload_inflight.store(false, Ordering::SeqCst);
    });
}

#[tauri::command]
fn get_config(
    key: String,
    store: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<Option<String>, String> {
    let store = store.lock().map_err(|err| err.to_string())?;
    store.get(&key).map_err(|err| err.to_string())
}

#[tauri::command]
fn set_config(
    key: String,
    value: String,
    store: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<(), String> {
    let store = store.lock().map_err(|err| err.to_string())?;
    store.set(&key, &value).map_err(|err| err.to_string())
}

#[tauri::command]
fn get_all_config(
    store: tauri::State<'_, Mutex<ConfigStore>>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let store = store.lock().map_err(|err| err.to_string())?;
    store.get_all().map_err(|err| err.to_string())
}

#[tauri::command]
fn get_cached_documents(documents_folder: String) -> Result<Vec<CachedDocumentPayload>, String> {
    let store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store.list_documents().map_err(|err| err.to_string())
}

#[tauri::command]
fn get_cached_document_tags(
    documents_folder: String,
) -> Result<Vec<CachedDocumentTagPayload>, String> {
    let store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store.list_document_tags().map_err(|err| err.to_string())
}

#[tauri::command]
fn upsert_cached_document(
    documents_folder: String,
    document: CachedDocumentPayload,
) -> Result<(), String> {
    let mut store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store
        .upsert_document(&document)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn delete_cached_document(documents_folder: String, document_id: String) -> Result<(), String> {
    let store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store
        .delete_document(&document_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn replace_cached_documents(
    documents_folder: String,
    documents: Vec<CachedDocumentPayload>,
) -> Result<(), String> {
    let mut store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store
        .replace_documents(&documents)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn get_cached_document_embedding_metadata(
    documents_folder: String,
) -> Result<Vec<CachedDocumentEmbeddingMetadataPayload>, String> {
    let store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store
        .list_document_embedding_metadata()
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn upsert_cached_document_embedding(
    documents_folder: String,
    embedding: CachedDocumentEmbeddingPayload,
) -> Result<(), String> {
    let mut store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store
        .upsert_document_embedding(&embedding)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn delete_cached_document_embedding(
    documents_folder: String,
    document_id: String,
) -> Result<(), String> {
    let store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store
        .delete_document_embedding(&document_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn replace_cached_document_embeddings(
    documents_folder: String,
    embeddings: Vec<CachedDocumentEmbeddingPayload>,
) -> Result<(), String> {
    let mut store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store
        .replace_document_embeddings(&embeddings)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn semantic_search_cached_documents(
    documents_folder: String,
    query_vector: Vec<f32>,
    limit: usize,
    min_score: f32,
    exclude_document_id: Option<String>,
) -> Result<Vec<SemanticSearchHitPayload>, String> {
    let store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store
        .semantic_search_documents(query_vector, limit, min_score, exclude_document_id)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn hybrid_search_cached_documents(
    documents_folder: String,
    query_vector: Vec<f32>,
    query_text: String,
    semantic_weight: f32,
    bm25_weight: f32,
    limit: usize,
    min_score: f32,
    exclude_document_id: Option<String>,
) -> Result<Vec<HybridSearchHitPayload>, String> {
    let store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store
        .hybrid_search_documents(
            query_vector,
            &query_text,
            limit,
            min_score,
            exclude_document_id,
            semantic_weight,
            bm25_weight,
        )
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn replace_cached_document_chunk_embeddings(
    documents_folder: String,
    document_id: String,
    chunks: Vec<CachedDocumentChunkEmbeddingPayload>,
) -> Result<(), String> {
    let mut store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    store
        .replace_document_chunk_embeddings(&document_id, &chunks)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn sync_document_embeddings(
    documents_folder: String,
    document: EmbeddingSyncDocumentPayload,
) -> Result<(), String> {
    let mut store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    sync_document_embeddings_in_core(&mut store, &document, None).map_err(|err| err.to_string())
}

#[tauri::command]
fn sync_documents_embeddings_batch(
    documents_folder: String,
    documents: Vec<EmbeddingSyncDocumentPayload>,
) -> Result<EmbeddingBatchSyncResultPayload, String> {
    let mut store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    sync_documents_embeddings_batch_in_core(&mut store, &documents).map_err(|err| err.to_string())
}

#[tauri::command]
fn delete_document_embeddings(documents_folder: String, document_id: String) -> Result<(), String> {
    let mut store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    delete_document_embeddings_in_core(&mut store, &document_id).map_err(|err| err.to_string())
}

#[tauri::command]
fn hybrid_search_documents_by_query(
    documents_folder: String,
    query_text: String,
    semantic_query_text: Option<String>,
    semantic_weight: f32,
    bm25_weight: f32,
    limit: usize,
    min_score: f32,
    exclude_document_id: Option<String>,
) -> Result<Vec<HybridSearchHitPayload>, String> {
    let store =
        DocumentCacheStore::new(Path::new(&documents_folder)).map_err(|err| err.to_string())?;
    hybrid_search_documents_by_query_in_core(
        &store,
        &query_text,
        semantic_query_text.as_deref(),
        limit,
        min_score,
        exclude_document_id,
        semantic_weight,
        bm25_weight,
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn list_document_folders(documents_folder: String) -> Result<Vec<DocumentFolderPayload>, String> {
    DocumentFoldersService::list_folders(Path::new(&documents_folder)).map_err(|err| err.to_string())
}

#[tauri::command]
fn create_document_folder(
    documents_folder: String,
    folder_path: String,
) -> Result<DocumentFolderPayload, String> {
    DocumentFoldersService::create_folder(Path::new(&documents_folder), &folder_path)
        .map_err(|err| err.to_string())
}

#[tauri::command]
fn rename_document_folder(
    documents_folder: String,
    folder_path: String,
    new_name: String,
) -> Result<DocumentFolderPayload, String> {
    DocumentFoldersService::rename_folder(
        Path::new(&documents_folder),
        &RenameDocumentFolderInputPayload {
            path: folder_path,
            name: new_name,
        },
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn delete_document_folder(
    documents_folder: String,
    folder_path: String,
    recursive: bool,
) -> Result<(), String> {
    DocumentFoldersService::delete_folder(
        Path::new(&documents_folder),
        &DeleteDocumentFolderInputPayload {
            path: folder_path,
            recursive,
        },
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn move_document_to_folder(
    documents_folder: String,
    document_id: String,
    target_folder_path: String,
) -> Result<MoveDocumentResultPayload, String> {
    DocumentFoldersService::move_document_to_folder(
        Path::new(&documents_folder),
        &document_id,
        &target_folder_path,
    )
    .map_err(|err| err.to_string())
}

#[tauri::command]
fn get_embedding_model_load_state(
    runtime: tauri::State<'_, EmbeddingRuntimeState>,
) -> Result<EmbeddingModelLoadStatePayload, String> {
    runtime.snapshot()
}

#[tauri::command]
fn preload_embedding_model(
    app_handle: tauri::AppHandle,
    runtime: tauri::State<'_, EmbeddingRuntimeState>,
) -> Result<(), String> {
    spawn_embedding_model_preload(app_handle, runtime.inner().clone());
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_config,
            set_config,
            get_all_config,
            get_cached_documents,
            get_cached_document_tags,
            upsert_cached_document,
            delete_cached_document,
            replace_cached_documents,
            get_cached_document_embedding_metadata,
            upsert_cached_document_embedding,
            delete_cached_document_embedding,
            replace_cached_document_embeddings,
            semantic_search_cached_documents,
            hybrid_search_cached_documents,
            replace_cached_document_chunk_embeddings,
            sync_document_embeddings,
            sync_documents_embeddings_batch,
            delete_document_embeddings,
            hybrid_search_documents_by_query,
            list_document_folders,
            create_document_folder,
            rename_document_folder,
            delete_document_folder,
            move_document_to_folder,
            get_embedding_model_load_state,
            preload_embedding_model
        ])
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir().unwrap_or_else(|_| {
                tentacle_core::config::default_data_dir().expect("no data dir")
            });
            let store = ConfigStore::new(&data_dir).expect("failed to init config");
            app.manage(Mutex::new(store));
            let embedding_runtime = EmbeddingRuntimeState::new();
            app.manage(embedding_runtime.clone());

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            spawn_embedding_model_preload(app.handle().clone(), embedding_runtime);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
