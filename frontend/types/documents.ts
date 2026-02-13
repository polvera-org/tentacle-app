export interface Document {
  id: string
  user_id: string
  title: string
  body: string
  tags: string[]
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
  tags: string[]
  banner_image_url: string | null
  created_at: string
  updated_at: string
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

export interface CreateDocumentPayload {
  title?: string
  tags?: string[]
}

export interface UpdateDocumentPayload {
  title?: string
  body?: string
  tags?: string[]
  banner_image_url?: string | null
}
