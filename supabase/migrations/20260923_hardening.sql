-- =============================================================
-- Hardening migration — run AFTER schema.sql (+ storage.sql).
-- Idempotent. Fixes audit findings without breaking demo flows.
-- 1) users role-escalation trigger  2) verified-employer-only job writes
-- 3) audit insert allowlist  4) contact-prefs privacy-by-default
-- 5) shortlist/match dedupe  6) hot-path indexes  7) least-privilege grants
-- =============================================================

-- ---------- 1. users: block self-promotion to admin ----------
CREATE OR REPLACE FUNCTION public.block_user_escalation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_admin() THEN RETURN NEW; END IF;
  -- Self-signup may only create candidate/employer, active, unverified.
  IF TG_OP = 'INSERT' THEN
    IF NEW.role NOT IN ('candidate', 'employer') THEN
      RAISE EXCEPTION 'role must be candidate or employer';
    END IF;
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'status must be active on signup';
    END IF;
    IF NEW.email_verified THEN
      RAISE EXCEPTION 'email_verified must be false on signup';
    END IF;
    RETURN NEW;
  END IF;
  -- Non-admins may not change role/status/email_verified of anyone.
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.email_verified IS DISTINCT FROM OLD.email_verified THEN
    RAISE EXCEPTION 'only admins may change role/status/verification';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS users_no_escalation ON public.users;
CREATE TRIGGER users_no_escalation
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.block_user_escalation();

-- ---------- 2. jobs / job_requirements: verified employers only ----------
DROP POLICY IF EXISTS jobs_owner_all ON public.jobs;
CREATE POLICY jobs_owner_all ON public.jobs
  FOR ALL TO authenticated
  USING (employer_id = public.my_verified_employer_id() OR public.is_admin())
  WITH CHECK (employer_id = public.my_verified_employer_id() OR public.is_admin());

DROP POLICY IF EXISTS jobreq_owner_all ON public.job_requirements;
CREATE POLICY jobreq_owner_all ON public.job_requirements
  FOR ALL TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.employer_id = public.my_verified_employer_id()
    )
  )
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.employer_id = public.my_verified_employer_id()
    )
  );

-- ---------- 3. audit_logs: allowlist actions, bind actor ----------
DROP POLICY IF EXISTS audit_insert_auth ON public.audit_logs;
CREATE POLICY audit_insert_auth ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    action IN ('search','profile_view','contact','shortlist','export','profile_update','upload')
    AND (actor_id IS NULL OR actor_id = public.my_user_id())
  );

-- ---------- 4. contact prefs: privacy by default for new rows ----------
ALTER TABLE public.candidates ALTER COLUMN show_email SET DEFAULT FALSE;
ALTER TABLE public.candidates ALTER COLUMN show_phone SET DEFAULT FALSE;
ALTER TABLE public.candidates ALTER COLUMN show_linkedin SET DEFAULT FALSE;
ALTER TABLE public.candidates ALTER COLUMN show_github SET DEFAULT FALSE;
ALTER TABLE public.candidates ALTER COLUMN show_portfolio SET DEFAULT FALSE;
ALTER TABLE public.candidates ALTER COLUMN show_resume SET DEFAULT FALSE;
ALTER TABLE public.candidates ALTER COLUMN show_photo SET DEFAULT FALSE;

-- ---------- 5. dedupe: NULL-safe uniques ----------
CREATE UNIQUE INDEX IF NOT EXISTS shortlists_emp_cand_nojob
  ON public.shortlists (employer_id, candidate_id) WHERE job_id IS NULL AND employer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shortlists_cand_only
  ON public.shortlists (candidate_id) WHERE employer_id IS NULL AND job_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shortlists_emp_cand_job_nn
  ON public.shortlists (employer_id, candidate_id, job_id) WHERE employer_id IS NOT NULL AND job_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS candidate_matches_search_cand_full
  ON public.candidate_matches (search_id, candidate_id);
DO $$ BEGIN
  ALTER TABLE public.contact_log ADD CONSTRAINT contact_log_message_max CHECK (message IS NULL OR char_length(message) <= 4000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- 6. hot-path indexes ----------
CREATE INDEX IF NOT EXISTS idx_candidates_visible_updated ON public.candidates (visibility_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_candidates_visible_exp ON public.candidates (visibility_status, total_experience_years);
CREATE INDEX IF NOT EXISTS idx_employers_verified ON public.employers (verification_status) WHERE verification_status = 'verified';
CREATE INDEX IF NOT EXISTS idx_jobs_employer_status ON public.jobs (employer_id, status);
CREATE INDEX IF NOT EXISTS idx_chunks_candidate_type ON public.profile_chunks (candidate_id, chunk_type);
CREATE INDEX IF NOT EXISTS idx_contact_log_cand_created ON public.contact_log (candidate_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_log_emp_created ON public.contact_log (employer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_log_job ON public.contact_log (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_searches_query_created ON public.searches (query_text, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_search_score ON public.candidate_matches (search_id, score DESC) WHERE search_id IS NOT NULL;
DO $$ BEGIN
  IF to_regclass('public.open_source_contributions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_oss_tech ON public.open_source_contributions USING gin (tech_stack);
  END IF;
END $$;
DROP INDEX IF EXISTS public.idx_candidate_skills_candidate;

-- ---------- 7. least-privilege grants ----------
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_candidate_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owns_candidate(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.candidate_is_visible(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_verified_employer() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_verified_employer_id() TO authenticated;

-- ---------- 8. storage: strict UUID first segment ----------
DROP POLICY IF EXISTS files_owner_insert ON storage.objects;
CREATE POLICY files_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('resumes', 'photos', 'portfolios')
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (storage.foldername(name))[1] = public.my_candidate_id()::text
      )
    )
  );
DROP POLICY IF EXISTS files_owner_read ON storage.objects;
CREATE POLICY files_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('resumes', 'photos', 'portfolios')
    AND (
      public.is_admin()
      OR (
        (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        AND (storage.foldername(name))[1] = public.my_candidate_id()::text
      )
    )
  );
DROP POLICY IF EXISTS files_employer_read ON storage.objects;
CREATE POLICY files_employer_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('resumes', 'photos', 'portfolios')
    AND public.is_verified_employer()
    AND (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.candidate_is_visible(((storage.foldername(name))[1])::uuid)
  );

CREATE TABLE IF NOT EXISTS public.open_source_contributions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  repo_name     TEXT NOT NULL,
  repo_url      TEXT,
  description   TEXT,
  pr_links      TEXT[] NOT NULL DEFAULT '{}',
  tech_stack    TEXT[] NOT NULL DEFAULT '{}',
  role          TEXT NOT NULL DEFAULT 'Contributor',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oss_candidate_idx
  ON public.open_source_contributions (candidate_id);

ALTER TABLE public.open_source_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oss_owner_all ON public.open_source_contributions;
CREATE POLICY oss_owner_all ON public.open_source_contributions
  FOR ALL TO authenticated
  USING (public.owns_candidate(candidate_id) OR public.is_admin())
  WITH CHECK (public.owns_candidate(candidate_id) OR public.is_admin());

DROP POLICY IF EXISTS oss_employer_read ON public.open_source_contributions;
CREATE POLICY oss_employer_read ON public.open_source_contributions
  FOR SELECT TO authenticated
  USING (public.candidate_is_visible(candidate_id) AND public.is_verified_employer());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.open_source_contributions TO authenticated;

ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS query_hash TEXT;
ALTER TABLE public.searches ADD COLUMN IF NOT EXISTS query_embedding vector(1024);

CREATE INDEX IF NOT EXISTS idx_searches_query_hash
  ON public.searches (query_hash);
CREATE UNIQUE INDEX IF NOT EXISTS candidate_matches_search_cand_full
  ON public.candidate_matches (search_id, candidate_id);
CREATE INDEX IF NOT EXISTS idx_candidates_contact_email_lower
  ON public.candidates (lower(contact_email));
CREATE INDEX IF NOT EXISTS idx_chunks_metadata_gin
  ON public.profile_chunks USING gin (metadata_json);
CREATE INDEX IF NOT EXISTS idx_searches_filters_gin
  ON public.searches USING gin (filters_json);
CREATE INDEX IF NOT EXISTS idx_projects_tech_gin
  ON public.projects USING gin (tech_stack);
CREATE INDEX IF NOT EXISTS idx_work_exp_tech_gin
  ON public.work_experiences USING gin (tech_stack);

GRANT EXECUTE ON FUNCTION public.match_chunks(vector(1024), INT, TEXT, NUMERIC, NUMERIC, TEXT, UUID[], TEXT, TEXT[], TEXT[], INT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.match_chunks(vector(1024), INT, TEXT, NUMERIC, NUMERIC, TEXT, UUID[], TEXT, TEXT[], TEXT[], INT) FROM anon, authenticated, public;
