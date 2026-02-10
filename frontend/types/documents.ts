export interface Document {
  id: string
  user_id: string
  title: string
  body: string
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
  banner_image_url: string | null
  created_at: string
  updated_at: string
}

export interface CreateDocumentPayload {
  title?: string
}

export interface UpdateDocumentPayload {
  title?: string
  body?: string
  banner_image_url?: string | null
}
