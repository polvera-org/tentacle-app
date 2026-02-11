import { createClient } from '@/lib/auth/supabase-client'
import type { Document, DocumentListItem, CreateDocumentPayload, UpdateDocumentPayload } from '@/types/documents'

export async function fetchDocuments(): Promise<DocumentListItem[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('documents')
    .select('id, title, body, banner_image_url, created_at, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(`Failed to fetch documents: ${error.message}`)
  return data
}

export async function createDocument(payload?: CreateDocumentPayload): Promise<Document> {
  const supabase = createClient()

  // Get the current user's ID
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('documents')
    .insert({
      user_id: user.id,
      title: payload?.title || 'Untitled',
      body: '',
    })
    .select()
    .single()

  if (error) throw new Error(`Failed to create document: ${error.message}`)
  return data
}

export async function fetchDocument(id: string): Promise<Document> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) throw new Error(`Failed to fetch document: ${error.message}`)
  return data
}

export async function updateDocument(id: string, payload: UpdateDocumentPayload): Promise<Document> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('documents')
    .update(payload)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(`Failed to update document: ${error.message}`)
  return data
}

export async function deleteDocument(id: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) throw new Error(`Failed to delete document: ${error.message}`)
}
