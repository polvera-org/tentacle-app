-- Seed data for Tentacle app
-- This file contains sample data for development and testing

-- Note: This seed file is for development purposes only
-- Production data should be created through the application

-- ============================================
-- Example: Insert test user (for development)
-- Uncomment and modify for local development
-- ============================================

/*
-- Create a test user in auth.users (requires admin privileges)
-- This would typically be done via Supabase Dashboard or API

INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  raw_app_meta_data,
  raw_user_meta_data
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'test@example.com',
  crypt('TestPass123!', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider": "email", "providers": ["email"]}',
  '{"full_name": "Test User"}'
);

-- Profile will be automatically created by the trigger
-- But we can update it with additional data if needed
UPDATE public.profiles 
SET 
  full_name = 'Test User',
  avatar_url = 'https://api.dicebear.com/7.x/avataaars/svg?seed=test'
WHERE id = '00000000-0000-0000-0000-000000000001';
*/

-- ============================================
-- Enable required extensions
-- ============================================

-- Enable UUID extension (usually already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pgcrypto for password hashing (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- Comments for documentation
-- ============================================

COMMENT ON TABLE public.profiles IS 'User profiles extending auth.users with app-specific data';
