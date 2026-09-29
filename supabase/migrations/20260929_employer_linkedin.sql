-- Employer LinkedIn profile for verification evidence.
-- Idempotent. Run after supabase/schema.sql.
ALTER TABLE public.employers ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
