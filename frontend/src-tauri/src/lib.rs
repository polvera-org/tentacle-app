use std::path::Path;
use std::sync::Mutex;
use tauri::Manager;
use tentacle_core::config::ConfigStore;
use tentacle_core::document_cache::{
    CachedDocumentChunkEmbeddingPayload, CachedDocumentEmbeddingMetadataPayload,
    CachedDocumentEmbeddingPayload, CachedDocumentPayload, CachedDocumentTagPayload,
    DocumentCacheStore, HybridSearchHitPayload, SemanticSearchHitPayload,
};
use tentacle_core::embeddings::{
    delete_document_embeddings as delete_document_embeddings_in_core,
    hybrid_search_documents_by_query as hybrid_search_documents_by_query_in_core,
    sync_document_embeddings as sync_document_embeddings_in_core,
    sync_documents_embeddings_batch as sync_documents_embeddings_batch_in_core,
    EmbeddingBatchSyncResultPayload, EmbeddingSyncDocumentPayload,
};

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
            hybrid_search_documents_by_query
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

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
