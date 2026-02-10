import type { Document, DocumentListItem, CreateDocumentPayload, UpdateDocumentPayload } from '@/types/documents'

export async function fetchDocuments(): Promise<DocumentListItem[]> {
  const res = await fetch('/api/documents')
  if (!res.ok) throw new Error('Failed to fetch documents')
  return res.json()
}

export async function createDocument(payload?: CreateDocumentPayload): Promise<Document> {
  const res = await fetch('/api/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
  })
  if (!res.ok) throw new Error('Failed to create document')
  return res.json()
}

export async function fetchDocument(id: string): Promise<Document> {
  const res = await fetch(`/api/documents/${id}`)
  if (!res.ok) throw new Error('Failed to fetch document')
  return res.json()
}

export async function updateDocument(id: string, payload: UpdateDocumentPayload): Promise<Document> {
  const res = await fetch(`/api/documents/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to update document')
  return res.json()
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete document')
}
