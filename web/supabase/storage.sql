-- =============================================================
-- Reverse-Hiring MVP — Supabase Storage buckets + policies
-- Sources: docs/09-privacy-visibility-open-contact-model.md
--          (OPEN-CONTACT: verified employers see matched files)
--
-- Run AFTER schema.sql. Idempotent (ON CONFLICT / DROP IF EXISTS).
-- Buckets are PRIVATE (public = false). All browser reads go
-- through service_role signed URLs minted by /api/uploads
-- (server-side, bypasses RLS, 1h expiry). The policies below
-- additionally allow direct authenticated access:
--   * candidates: insert/read/update/delete objects under their
--     own candidate-id prefix  ({candidate_id}/...)
--   * verified employers: read files of visible candidates
--   * admins: everything
-- Path convention (enforced by /api/uploads, not by SQL):
--   resumes/{candidate_id}/{file}
--   photos/{candidate_id}/{file}
--   portfolios/{candidate_id}/{file}
-- Requires: schema.sql helpers public.my_candidate_id(),
--   public.owns_candidate(uuid), public.candidate_is_visible(uuid),
--   public.is_verified_employer(), public.is_admin().
-- =============================================================

-- ---------- 1. Private buckets ----------
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('resumes',    'resumes',    false),
  ('photos',     'photos',     false),
  ('portfolios', 'portfolios', false)
ON CONFLICT (id) DO NOTHING;

-- ---------- 2. Policies on storage.objects ----------
-- First path segment is the owning candidate's id:
--   (storage.foldername(name))[1]
-- Guard every uuid cast with a regex so non-conforming keys
-- (e.g. in-flight multipart prefixes) never raise.

-- ----- owners: INSERT own prefix -----
DROP POLICY IF EXISTS files_owner_insert ON storage.objects;
CREATE POLICY files_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('resumes', 'photos', 'portfolios')
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND (storage.foldername(name))[1] = public.my_candidate_id()::text
      )
    )
  );

-- ----- owners: SELECT own prefix -----
DROP POLICY IF EXISTS files_owner_read ON storage.objects;
CREATE POLICY files_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('resumes', 'photos', 'portfolios')
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND (storage.foldername(name))[1] = public.my_candidate_id()::text
      )
    )
  );

-- ----- owners: UPDATE own prefix -----
DROP POLICY IF EXISTS files_owner_update ON storage.objects;
CREATE POLICY files_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('resumes', 'photos', 'portfolios')
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND (storage.foldername(name))[1] = public.my_candidate_id()::text
      )
    )
  )
  WITH CHECK (
    bucket_id IN ('resumes', 'photos', 'portfolios')
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND (storage.foldername(name))[1] = public.my_candidate_id()::text
      )
    )
  );

-- ----- owners: DELETE own prefix -----
DROP POLICY IF EXISTS files_owner_delete ON storage.objects;
CREATE POLICY files_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('resumes', 'photos', 'portfolios')
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
        AND (storage.foldername(name))[1] = public.my_candidate_id()::text
      )
    )
  );

-- ----- verified employers: READ visible candidates' files -----
-- OPEN-CONTACT: any visible candidate's files are readable by any
-- verified employer (matching is enforced at the search layer,
-- not per-object; every read is audit-logged by the app).
DROP POLICY IF EXISTS files_employer_read ON storage.objects;
CREATE POLICY files_employer_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('resumes', 'photos', 'portfolios')
    AND public.is_verified_employer()
    AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    AND public.candidate_is_visible(((storage.foldername(name))[1])::uuid)
  );
