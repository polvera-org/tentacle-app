export interface Document {
  id: string
  user_id: string
  title: string
  body: string
  folder_path: string
  tags: string[]
  tags_locked?: boolean
  banner_image_url: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface DocumentTag {
  id: string
  document_id: string
  tag: string
  created_at: string
}

export interface DocumentListItem {
  id: string
  title: string
  body: string
  folder_path: string
  tags: string[]
  tags_locked?: boolean
  banner_image_url: string | null
  created_at: string
  updated_at: string
}

export interface DocumentFolder {
  path: string
  name: string
  parent_path: string | null
  document_count: number
  subfolder_count: number
}

export interface DocumentTagUsage {
  tag: string
  last_used_at: string
  usage_count: number
}

export interface DocumentEmbeddingMetadata {
  document_id: string
  model: string
  content_hash: string
  updated_at: string
}

export interface CachedDocumentEmbeddingPayload {
  document_id: string
  model: string
  content_hash: string
  vector: number[]
  updated_at: string
}

export interface SemanticSearchHit {
  document_id: string
  score: number
}

export interface HybridSearchHit {
  document_id: string
  score: number
}

export interface CachedDocumentChunkEmbeddingPayload {
  document_id: string
  chunk_index: number
  chunk_text: string
  content_hash: string
  model: string
  vector: number[]
  updated_at: string
}

export interface CreateDocumentPayload {
  title?: string
  folder_path?: string
  tags?: string[]
}

export interface UpdateDocumentPayload {
  title?: string
  body?: string
  folder_path?: string
  tags?: string[]
  tags_locked?: boolean
  banner_image_url?: string | null
}
