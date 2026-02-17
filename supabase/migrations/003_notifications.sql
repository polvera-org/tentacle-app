-- Notifications migration
-- Migration: 003_notifications

-- ============================================
-- Notification Type Enum
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'notification_type'
      AND typnamespace = 'public'::regnamespace
  ) THEN
    CREATE TYPE public.notification_type AS ENUM ('UPDATE');
  END IF;
END
$$;

-- ============================================
-- Notifications Table
-- ============================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type public.notification_type NOT NULL,
  notification_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_notification_type ON public.notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at_desc ON public.notifications(created_at DESC);

-- ============================================
-- Enable RLS
-- ============================================

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS Policies for Notifications
-- ============================================

CREATE POLICY "Users can view global and own notifications"
  ON public.notifications
  FOR SELECT
  USING (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Service role can insert notifications"
  ON public.notifications
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can delete notifications"
  ON public.notifications
  FOR DELETE
  USING (auth.role() = 'service_role');

-- ============================================
-- Grant permissions
-- ============================================

GRANT SELECT ON public.notifications TO anon, authenticated;
GRANT ALL ON public.notifications TO service_role;

-- ============================================
-- Comments
-- ============================================

COMMENT ON TABLE public.notifications IS 'Global and per-user notifications';
COMMENT ON COLUMN public.notifications.user_id IS 'NULL for global notifications, set for user-targeted notifications';
COMMENT ON COLUMN public.notifications.notification_data IS 'Payload by type; UPDATE requires version_id';
