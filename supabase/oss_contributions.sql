-- Open source contributions (candidate's OSS work, separate from projects).
-- Run in Supabase SQL Editor AFTER schema.sql. Idempotent.

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
