# Supabase Schema and RLS

This document describes the SQL schema currently defined in `supabase/migrations` and how the frontend consumes it.

## 1) Scope

Supabase is optional in this repo and currently used for:

- Auth/profile (`profiles`)
- Update notifications (`notifications`)
- (historical/future cloud paths) documents tables in Supabase (`documents`, `document_tags`)

Local markdown + local cache remain the primary document path today.

## 2) Migration Inventory

- `001_initial_schema.sql`
- `002_documents.sql`
- `003_notifications.sql`

## 3) `profiles` Table (`001_initial_schema.sql`)

Columns:

- `id` (PK, references `auth.users.id`)
- `email`
- `full_name`
- `avatar_url`
- `created_at`
- `updated_at`

RLS policies:

- select own profile: `auth.uid() = id`
- update own profile: `auth.uid() = id`
- insert with check: `auth.uid() = id`

Automation:

- trigger `handle_new_user` auto-creates profile on new auth user.
- trigger `update_updated_at_column` maintains `updated_at`.

## 4) `documents` and `document_tags` (`002_documents.sql`)

### `documents`

Columns include:

- `id`, `user_id`, `title`, `body`, `banner_image_url`, `deleted_at`, timestamps

RLS:

- users can select/insert/update/delete own rows via `auth.uid() = user_id`

### `document_tags`

Columns include:

- `id`, `document_id`, `tag`, `created_at`

RLS:

- all access checks ownership via join to `documents` table

Notes:

- unique index on `(document_id, tag)`
- `deleted_at` on documents is soft-delete support in SQL model

## 5) `notifications` (`003_notifications.sql`)

Enum:

- `public.notification_type` with current value `UPDATE`

Table columns:

- `id`
- `user_id` nullable (`NULL` means global)
- `notification_type`
- `notification_data` (`JSONB`)
- `created_at`

RLS:

- select: user can read global (`user_id IS NULL`) and own (`auth.uid() = user_id`)
- insert/update/delete: service role only (`auth.role() = 'service_role'`)

## 6) Frontend Consumption

Current frontend usage:

- profile read/write via `frontend/lib/account/profile.ts`
- update notifications via `frontend/lib/notifications/api.ts`

Notification payload expectations in frontend parser:

- `notification_type = 'UPDATE'`
- `notification_data.version_id` must be dotted numeric (e.g. `0.1.0`)
- optional `title`, `message`, `release_url`

## 7) Security and Contribution Rules

1. Do not relax RLS policies without a concrete threat analysis.
2. Add migration files for every schema/policy change; do not mutate old migrations in-place.
3. Keep service-role-only mutation policies for global notifications.
4. If adding new notification types, update:
   - enum migration
   - frontend parser/validation
   - provider display logic
5. Document rollout/backfill steps for any non-null new columns.

## 8) Operational Checklist for Schema Changes

Before merge:

1. Verify migration applies cleanly on a fresh project.
2. Verify existing policies still permit expected reads/writes.
3. Test frontend paths against staged schema.
4. Update this document and any API parser contracts impacted.
