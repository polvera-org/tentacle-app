-- Documents and Document Tags migration
-- Migration: 002_documents

-- ============================================
-- Documents Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  body TEXT DEFAULT '',
  banner_image_url TEXT,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for documents
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at);
CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON public.documents(updated_at);
CREATE INDEX IF NOT EXISTS idx_documents_user_id_updated_at ON public.documents(user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================
-- Document Tags Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.document_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for document_tags
CREATE INDEX IF NOT EXISTS idx_document_tags_document_id ON public.document_tags(document_id);
CREATE INDEX IF NOT EXISTS idx_document_tags_tag ON public.document_tags(tag);

-- Unique constraint to prevent duplicate tags per document
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_tags_unique
  ON public.document_tags(document_id, tag);

-- ============================================
-- Enable RLS
-- ============================================

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for Documents
-- ============================================

CREATE POLICY "Users can view own documents"
  ON public.documents
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON public.documents
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON public.documents
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON public.documents
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- RLS Policies for Document Tags
-- (Join through documents to check ownership)
-- ============================================

CREATE POLICY "Users can view own document tags"
  ON public.document_tags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_tags.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own document tags"
  ON public.document_tags
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_tags.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own document tags"
  ON public.document_tags
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_tags.document_id
        AND documents.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own document tags"
  ON public.document_tags
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.documents
      WHERE documents.id = document_tags.document_id
        AND documents.user_id = auth.uid()
    )
  );

-- ============================================
-- updated_at trigger for documents
-- (Reuses the update_updated_at_column function from 001_initial_schema)
-- ============================================

DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- Grant permissions
-- ============================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_tags TO authenticated;
GRANT ALL ON public.documents TO service_role;
GRANT ALL ON public.document_tags TO service_role;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE public.documents IS 'User documents with rich text content';
COMMENT ON COLUMN public.documents.body IS 'Tiptap JSON content stored as text';
COMMENT ON COLUMN public.documents.deleted_at IS 'Soft delete timestamp; NULL means active';
COMMENT ON TABLE public.document_tags IS 'Tags associated with documents';
