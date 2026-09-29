-- =============================================================
-- Reverse-Hiring MVP - Supabase / Postgres schema
-- Sources: docs/03-database-vs-txt-and-schema.md (source of truth),
--          docs/09-privacy-visibility-open-contact-model.md (OPEN-CONTACT)
--
-- Model: OPEN-CONTACT - NO hidden gate, NO unlock flow.
--   Verified employers see full matched profiles immediately,
--   including contact fields (email/phone/links).
--   contact_log is audit-only, not an approval gate.
--
-- Run: paste whole file into Supabase SQL editor (or `supabase db push`
--      / psql). Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE
--      / DROP POLICY IF EXISTS).
-- Requires extensions: vector, pg_trgm, unaccent (+ pgcrypto for uuids)
-- =============================================================

-- ---------- 0. Extensions ----------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Immutable unaccent wrapper so it can be used inside indexes.
-- SET search_path pins resolution of both the unaccent() function and
-- the 'unaccent' dictionary, whether Supabase installs the extension
-- into public or extensions schema.
CREATE OR REPLACE FUNCTION public.f_unaccent(text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = public, extensions
AS
$$ SELECT unaccent('unaccent', $1) $$;

-- Auto-bump updated_at trigger helper.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql AS
$$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =============================================================
-- 1. TABLES
-- =============================================================

-- ---------- users: auth + role ----------
-- auth_id links to auth.users(id) in Supabase Auth (no FK: auth schema
-- is managed by Supabase; app sets it from auth.uid() on signup).
CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id       UUID UNIQUE,               -- = auth.users.id
  email         TEXT UNIQUE NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('candidate','employer','admin')),
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- candidates ----------
-- OPEN-CONTACT: contact_* + link columns live HERE and are readable
-- by verified employers (no separate gated table).
CREATE TABLE IF NOT EXISTS public.candidates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES public.users(id) ON DELETE SET NULL,
  full_name               TEXT NOT NULL,
  headline                TEXT,
  domain                  TEXT,            -- e.g. backend, frontend, data, mobile
  current_position        TEXT,
  total_experience_years  NUMERIC CHECK (total_experience_years >= 0),
  education_level         TEXT,
  location_city           TEXT,
  location_country        TEXT DEFAULT 'India',
  remote_preference       TEXT CHECK (remote_preference IN ('remote_only','hybrid','onsite','flexible')),
  open_to_relocation      BOOLEAN NOT NULL DEFAULT FALSE,
  min_salary              NUMERIC CHECK (min_salary >= 0),
  salary_currency         TEXT NOT NULL DEFAULT 'INR',
  salary_frequency        TEXT NOT NULL DEFAULT 'monthly'
                          CHECK (salary_frequency IN ('monthly','yearly','hourly','stipend')),
  salary_negotiable       BOOLEAN NOT NULL DEFAULT TRUE,
  notice_period           TEXT,
  availability_status     TEXT CHECK (availability_status IN ('immediate','notice','inactive')),
  photo_url               TEXT,            -- optional; shown directly in open model
  -- OPEN-CONTACT fields: visible to verified employers, no gate.
  contact_email           TEXT,
  contact_phone           TEXT,
  linkedin_url            TEXT,
  github_url              TEXT,
  portfolio_url           TEXT,
  resume_url              TEXT,            -- Supabase Storage object URL
  -- visibility / consent
  visibility_status       TEXT NOT NULL DEFAULT 'visible'
                          CHECK (visibility_status IN ('visible','hidden','inactive')),
  consent_status          TEXT,            -- e.g. granted / withdrawn + timestamp in audit
  profile_strength        INT CHECK (profile_strength BETWEEN 0 AND 100),
  freshness_updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- candidate_profiles: generated summaries + raw resume ----------
CREATE TABLE IF NOT EXISTS public.candidate_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id          UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  summary_markdown      TEXT,              -- display + LLM context + export artifact
  summary_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  original_resume_text  TEXT,
  profile_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id)
);

-- ---------- work_experiences ----------
CREATE TABLE IF NOT EXISTS public.work_experiences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  company_name  TEXT,
  job_title     TEXT,
  employment_type TEXT,
  start_date    DATE,
  end_date      DATE,
  is_current    BOOLEAN NOT NULL DEFAULT FALSE,
  description   TEXT,
  achievements  TEXT,
  tech_stack    TEXT[] NOT NULL DEFAULT '{}',
  evidence_links TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- projects ----------
CREATE TABLE IF NOT EXISTS public.projects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id      UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  description       TEXT,
  problem_statement TEXT,
  tech_stack        TEXT[] NOT NULL DEFAULT '{}',
  role_in_project   TEXT,
  project_link      TEXT,
  repo_link         TEXT,
  deployment_link   TEXT,
  impact_summary    TEXT,
  metrics           TEXT,
  challenges_faced  TEXT,
  project_type      TEXT CHECK (project_type IN
                      ('personal','academic','freelance','production','open_source','prototype')),
  start_date        DATE,
  end_date          DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- project_depth_analysis (AI-generated per project) ----------
CREATE TABLE IF NOT EXISTS public.project_depth_analysis (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  complexity_score          INT CHECK (complexity_score BETWEEN 1 AND 10),
  technical_complexity      TEXT CHECK (technical_complexity IN ('low','medium','high','very_high')),
  architectural_concepts    TEXT[] NOT NULL DEFAULT '{}',
  business_impact           TEXT,
  autonomy_level            TEXT CHECK (autonomy_level IN ('solo','contributed','led','unknown')),
  evidence_quality          TEXT CHECK (evidence_quality IN ('weak','moderate','strong')),
  project_maturity          TEXT,
  relevance_tags            TEXT[] NOT NULL DEFAULT '{}',
  estimated_seniority_signal TEXT CHECK (estimated_seniority_signal IN
                              ('intern','junior','mid','senior','unknown')),
  raw_ai_analysis           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- education ----------
CREATE TABLE IF NOT EXISTS public.education (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  institution   TEXT,
  degree        TEXT,
  field_of_study TEXT,
  start_year    INT CHECK (start_year BETWEEN 1900 AND 2100),
  end_year      INT CHECK (end_year BETWEEN 1900 AND 2100),
  achievements  TEXT
);

-- ---------- skills (canonical + aliases; seeded) ----------
CREATE TABLE IF NOT EXISTS public.skills (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name      TEXT UNIQUE NOT NULL,  -- canonical: JavaScript, React, PostgreSQL
  aliases   TEXT[] NOT NULL DEFAULT '{}',
  category  TEXT,                  -- frontend, backend, mobile, data_ai, devops_cloud, tools
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- candidate_skills ----------
CREATE TABLE IF NOT EXISTS public.candidate_skills (
  candidate_id      UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  skill_id          UUID NOT NULL REFERENCES public.skills(id) ON DELETE RESTRICT,
  experience_years  NUMERIC CHECK (experience_years >= 0),
  proficiency_level TEXT CHECK (proficiency_level IN
                      ('beginner','intermediate','advanced','expert')),
  source            TEXT CHECK (source IN ('self_reported','extracted','verified')),
  evidence_strength INT CHECK (evidence_strength BETWEEN 0 AND 100),
  PRIMARY KEY (candidate_id, skill_id)
);

-- ---------- profile_chunks (pgvector semantic index) ----------
-- embedding dim = 1024 (voyage-4-lite).
-- embedding_model + embedding_dim recorded so a future model swap
-- can be detected and backfilled without guessing.
CREATE TABLE IF NOT EXISTS public.profile_chunks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id    UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  chunk_type      TEXT NOT NULL CHECK (chunk_type IN
                    ('summary','experience','project','education','skills')),
  content_text    TEXT NOT NULL,
  metadata_json   JSONB NOT NULL DEFAULT '{}'::jsonb,  -- e.g. {"project_id": "...", "job_title": "..."}
  embedding       vector(1024),                        -- NULL until embedded; backfill async
  embedding_model TEXT NOT NULL DEFAULT 'voyage-4-lite',
  embedding_dim   INT  NOT NULL DEFAULT 1024 CHECK (embedding_dim > 0),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- employers ----------
CREATE TABLE IF NOT EXISTS public.employers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES public.users(id) ON DELETE SET NULL,
  company_name        TEXT NOT NULL,
  company_email       TEXT,
  website             TEXT,
  company_size        TEXT,
  industry            TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending','verified','rejected','suspended')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- jobs ----------
CREATE TABLE IF NOT EXISTS public.jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id         UUID REFERENCES public.employers(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  domain              TEXT,
  seniority           TEXT,
  description         TEXT,
  responsibilities    TEXT,
  must_have_skills    TEXT[] NOT NULL DEFAULT '{}',
  nice_to_have_skills TEXT[] NOT NULL DEFAULT '{}',
  min_experience      NUMERIC CHECK (min_experience >= 0),
  max_experience      NUMERIC CHECK (max_experience >= 0),
  salary_min          NUMERIC CHECK (salary_min >= 0),
  salary_max          NUMERIC CHECK (salary_max >= 0),
  salary_currency     TEXT NOT NULL DEFAULT 'INR',
  location            TEXT,
  remote_policy       TEXT,
  employment_type     TEXT,
  start_date          DATE,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('draft','active','paused','closed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- job_requirements (parsed JD + embedding) ----------
CREATE TABLE IF NOT EXISTS public.job_requirements (
  job_id                  UUID PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
  must_have               TEXT[] NOT NULL DEFAULT '{}',
  nice_to_have            TEXT[] NOT NULL DEFAULT '{}',
  seniority               TEXT,
  domain                  TEXT,
  location                TEXT,
  salary_range            JSONB NOT NULL DEFAULT '{}'::jsonb,
  remote_policy           TEXT,
  core_responsibilities   TEXT[] NOT NULL DEFAULT '{}',
  implied_technical_needs TEXT[] NOT NULL DEFAULT '{}',
  full_parsed             JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding               vector(1024),
  embedding_model         TEXT NOT NULL DEFAULT 'voyage-4-lite',
  embedding_dim           INT  NOT NULL DEFAULT 1024 CHECK (embedding_dim > 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- searches ----------
CREATE TABLE IF NOT EXISTS public.searches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id   UUID REFERENCES public.employers(id) ON DELETE CASCADE,
  job_id        UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  query_text    TEXT,
  filters_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_count  INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- candidate_matches ----------
CREATE TABLE IF NOT EXISTS public.candidate_matches (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id           UUID REFERENCES public.searches(id) ON DELETE SET NULL,
  job_id              UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  candidate_id        UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  score               NUMERIC CHECK (score >= 0 AND score <= 100),
  sub_scores          JSONB NOT NULL DEFAULT '{}'::jsonb,
  match_reasons_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  status              TEXT NOT NULL DEFAULT 'shown'
                      CHECK (status IN ('shown','shortlisted','contacted','rejected','hired')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- shortlists ----------
CREATE TABLE IF NOT EXISTS public.shortlists (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id   UUID REFERENCES public.employers(id) ON DELETE CASCADE,
  candidate_id  UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id        UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  status        TEXT NOT NULL DEFAULT 'saved'
                CHECK (status IN ('saved','contacted','interviewing','offered','hired','rejected')),
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employer_id, candidate_id, job_id)
);

-- ---------- contact_log (OPEN-CONTACT: audit trail, NOT a gate) ----------
CREATE TABLE IF NOT EXISTS public.contact_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id   UUID REFERENCES public.employers(id) ON DELETE SET NULL,
  candidate_id  UUID REFERENCES public.candidates(id) ON DELETE CASCADE,
  job_id        UUID REFERENCES public.jobs(id) ON DELETE SET NULL,
  channel       TEXT CHECK (channel IN ('email','phone','platform','other')),
  message       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- audit_logs ----------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID,                -- users.id (nullable: system events)
  action      TEXT NOT NULL,       -- view, search, shortlist, contact_view, export, ...
  target_type TEXT,
  target_id   UUID,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_candidates_updated ON public.candidates;
CREATE TRIGGER trg_candidates_updated
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_candidate_profiles_updated ON public.candidate_profiles;
CREATE TRIGGER trg_candidate_profiles_updated
  BEFORE UPDATE ON public.candidate_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_employers_updated ON public.employers;
CREATE TRIGGER trg_employers_updated
  BEFORE UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_jobs_updated ON public.jobs;
CREATE TRIGGER trg_jobs_updated
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================
-- 2. INDEXES - structured + full-text/trigram + vector
-- =============================================================

-- ----- structured (btree / gin on arrays) -----
CREATE INDEX IF NOT EXISTS idx_candidates_visibility_domain
  ON public.candidates (visibility_status, domain);
CREATE INDEX IF NOT EXISTS idx_candidates_salary
  ON public.candidates (min_salary);
CREATE INDEX IF NOT EXISTS idx_candidates_experience
  ON public.candidates (total_experience_years);
CREATE INDEX IF NOT EXISTS idx_candidates_location
  ON public.candidates (location_city, location_country);
CREATE INDEX IF NOT EXISTS idx_candidates_availability
  ON public.candidates (availability_status);
CREATE INDEX IF NOT EXISTS idx_candidates_user
  ON public.candidates (user_id);
CREATE INDEX IF NOT EXISTS idx_candidates_freshness
  ON public.candidates (freshness_updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_skills_skill
  ON public.candidate_skills (skill_id);
CREATE INDEX IF NOT EXISTS idx_candidate_skills_candidate
  ON public.candidate_skills (candidate_id);

CREATE INDEX IF NOT EXISTS idx_work_exp_candidate
  ON public.work_experiences (candidate_id);
CREATE INDEX IF NOT EXISTS idx_projects_candidate
  ON public.projects (candidate_id);
CREATE INDEX IF NOT EXISTS idx_education_candidate
  ON public.education (candidate_id);
CREATE INDEX IF NOT EXISTS idx_depth_project
  ON public.project_depth_analysis (project_id);

CREATE INDEX IF NOT EXISTS idx_employers_user
  ON public.employers (user_id);
CREATE INDEX IF NOT EXISTS idx_employers_verification
  ON public.employers (verification_status);

CREATE INDEX IF NOT EXISTS idx_jobs_employer
  ON public.jobs (employer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status
  ON public.jobs (status);
CREATE INDEX IF NOT EXISTS idx_jobs_domain
  ON public.jobs (domain);
CREATE INDEX IF NOT EXISTS idx_jobs_must_have
  ON public.jobs USING gin (must_have_skills);

CREATE INDEX IF NOT EXISTS idx_searches_employer
  ON public.searches (employer_id);
CREATE INDEX IF NOT EXISTS idx_searches_job
  ON public.searches (job_id);
CREATE INDEX IF NOT EXISTS idx_matches_job_score
  ON public.candidate_matches (job_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_matches_candidate
  ON public.candidate_matches (candidate_id);

CREATE INDEX IF NOT EXISTS idx_shortlists_employer
  ON public.shortlists (employer_id);
CREATE INDEX IF NOT EXISTS idx_shortlists_candidate
  ON public.shortlists (candidate_id);
CREATE INDEX IF NOT EXISTS idx_shortlists_job
  ON public.shortlists (job_id);

CREATE INDEX IF NOT EXISTS idx_contact_log_employer
  ON public.contact_log (employer_id);
CREATE INDEX IF NOT EXISTS idx_contact_log_candidate
  ON public.contact_log (candidate_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor_time
  ON public.audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target
  ON public.audit_logs (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_profile_chunks_candidate
  ON public.profile_chunks (candidate_id);
CREATE INDEX IF NOT EXISTS idx_profile_chunks_type
  ON public.profile_chunks (chunk_type);

-- ----- trigram (typo-tolerant search, accent-insensitive via f_unaccent) -----
CREATE INDEX IF NOT EXISTS idx_candidates_name_trgm
  ON public.candidates USING gin (f_unaccent(full_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_candidates_headline_trgm
  ON public.candidates USING gin (f_unaccent(headline) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_candidates_role_trgm
  ON public.candidates USING gin (f_unaccent(current_position) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_work_exp_company_trgm
  ON public.work_experiences USING gin (f_unaccent(company_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_work_exp_title_trgm
  ON public.work_experiences USING gin (f_unaccent(job_title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_projects_title_trgm
  ON public.projects USING gin (f_unaccent(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm
  ON public.jobs USING gin (f_unaccent(title) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_skills_name_trgm
  ON public.skills USING gin (f_unaccent(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_chunks_content_trgm
  ON public.profile_chunks USING gin (f_unaccent(content_text) gin_trgm_ops);

-- ----- full-text (keyword relevance ranking complement) -----
CREATE INDEX IF NOT EXISTS idx_chunks_content_fts
  ON public.profile_chunks USING gin (to_tsvector('english', content_text));

-- ----- vector (semantic search), partial: NULL embeddings are never queried -----
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw_nn
  ON public.profile_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_req_embedding_hnsw_nn
  ON public.job_requirements USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;

-- =============================================================
-- 3. RLS - OPEN-CONTACT model
--   * NO anon access: no policies for anon => public gets nothing.
--   * Candidates: full control of own rows.
--   * Verified employers: SELECT visible candidates + all child data
--     INCLUDING contact_* columns (no gate), plus own jobs/searches/
--     matches/shortlists/contact_log writes.
--   * Candidates can SELECT contact_log + matches rows about themselves
--     (who viewed/contacted them) - transparency without a gate.
--   * Admins: everything. service_role bypasses RLS (backends/embeddings).
-- =============================================================

ALTER TABLE public.users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidates             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_experiences       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_depth_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skills                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_skills       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_chunks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_requirements       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.searches               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidate_matches      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlists             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs             ENABLE ROW LEVEL SECURITY;

-- ----- helper functions (SECURITY DEFINER so they bypass RLS) -----
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS
$$ SELECT EXISTS (
     SELECT 1 FROM public.users u
     WHERE u.auth_id = auth.uid() AND u.role = 'admin'
   ) $$;

-- The caller's own users.id (NULL when not signed in / no row yet).
CREATE OR REPLACE FUNCTION public.my_user_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS
$$ SELECT u.id FROM public.users u WHERE u.auth_id = auth.uid() LIMIT 1 $$;

-- The caller's candidate row id (NULL for non-candidates).
CREATE OR REPLACE FUNCTION public.my_candidate_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS
$$ SELECT c.id FROM public.candidates c
   JOIN public.users u ON u.id = c.user_id
   WHERE u.auth_id = auth.uid() LIMIT 1 $$;

-- The caller's employer row id, only when verified (NULL otherwise).
CREATE OR REPLACE FUNCTION public.my_verified_employer_id()
RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS
$$ SELECT e.id FROM public.employers e
   JOIN public.users u ON u.id = e.user_id
   WHERE u.auth_id = auth.uid()
     AND e.verification_status = 'verified'
   LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.is_verified_employer()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS
$$ SELECT EXISTS (
     SELECT 1 FROM public.employers e
     JOIN public.users u ON u.id = e.user_id
     WHERE u.auth_id = auth.uid()
       AND e.verification_status = 'verified'
   ) $$;

-- True when candidate pk belongs to the caller.
CREATE OR REPLACE FUNCTION public.owns_candidate(cand_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS
$$ SELECT EXISTS (
     SELECT 1 FROM public.candidates c
     JOIN public.users u ON u.id = c.user_id
     WHERE c.id = cand_id AND u.auth_id = auth.uid()
   ) $$;

-- True when candidate pk is visible (for employer reads).
CREATE OR REPLACE FUNCTION public.candidate_is_visible(cand_id uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS
$$ SELECT EXISTS (
     SELECT 1 FROM public.candidates c
     WHERE c.id = cand_id AND c.visibility_status = 'visible'
   ) $$;

-- ================= users =================
DROP POLICY IF EXISTS users_self_read ON public.users;
CREATE POLICY users_self_read ON public.users
  FOR SELECT TO authenticated
  USING (auth_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS users_self_insert ON public.users;
CREATE POLICY users_self_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS users_self_update ON public.users;
CREATE POLICY users_self_update ON public.users
  FOR UPDATE TO authenticated
  USING (auth_id = auth.uid() OR public.is_admin())
  WITH CHECK (auth_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS users_admin_all ON public.users;
CREATE POLICY users_admin_all ON public.users
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ================= candidates =================
DROP POLICY IF EXISTS candidates_owner_all ON public.candidates;
CREATE POLICY candidates_owner_all ON public.candidates
  FOR ALL TO authenticated
  USING (user_id = public.my_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.my_user_id() OR public.is_admin());

-- Verified employers read visible candidates INCLUDING contact columns.
DROP POLICY IF EXISTS candidates_employer_read ON public.candidates;
CREATE POLICY candidates_employer_read ON public.candidates
  FOR SELECT TO authenticated
  USING (visibility_status = 'visible' AND public.is_verified_employer());

-- ================= candidate_profiles =================
DROP POLICY IF EXISTS profiles_owner_all ON public.candidate_profiles;
CREATE POLICY profiles_owner_all ON public.candidate_profiles
  FOR ALL TO authenticated
  USING (public.owns_candidate(candidate_id) OR public.is_admin())
  WITH CHECK (public.owns_candidate(candidate_id) OR public.is_admin());

DROP POLICY IF EXISTS profiles_employer_read ON public.candidate_profiles;
CREATE POLICY profiles_employer_read ON public.candidate_profiles
  FOR SELECT TO authenticated
  USING (public.candidate_is_visible(candidate_id) AND public.is_verified_employer());

-- ================= work_experiences =================
DROP POLICY IF EXISTS workexp_owner_all ON public.work_experiences;
CREATE POLICY workexp_owner_all ON public.work_experiences
  FOR ALL TO authenticated
  USING (public.owns_candidate(candidate_id) OR public.is_admin())
  WITH CHECK (public.owns_candidate(candidate_id) OR public.is_admin());

DROP POLICY IF EXISTS workexp_employer_read ON public.work_experiences;
CREATE POLICY workexp_employer_read ON public.work_experiences
  FOR SELECT TO authenticated
  USING (public.candidate_is_visible(candidate_id) AND public.is_verified_employer());

-- ================= projects =================
DROP POLICY IF EXISTS projects_owner_all ON public.projects;
CREATE POLICY projects_owner_all ON public.projects
  FOR ALL TO authenticated
  USING (public.owns_candidate(candidate_id) OR public.is_admin())
  WITH CHECK (public.owns_candidate(candidate_id) OR public.is_admin());

DROP POLICY IF EXISTS projects_employer_read ON public.projects;
CREATE POLICY projects_employer_read ON public.projects
  FOR SELECT TO authenticated
  USING (public.candidate_is_visible(candidate_id) AND public.is_verified_employer());

-- ================= project_depth_analysis =================
-- (AI-written; owners + verified employers read, owners/admins write.
--  Backend embedding/scoring jobs use service_role and bypass RLS.)
DROP POLICY IF EXISTS depth_owner_write ON public.project_depth_analysis;
CREATE POLICY depth_owner_write ON public.project_depth_analysis
  FOR ALL TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND public.owns_candidate(p.candidate_id)
    )
  )
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND public.owns_candidate(p.candidate_id)
    )
  );

DROP POLICY IF EXISTS depth_employer_read ON public.project_depth_analysis;
CREATE POLICY depth_employer_read ON public.project_depth_analysis
  FOR SELECT TO authenticated
  USING (
    public.is_verified_employer() AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id AND public.candidate_is_visible(p.candidate_id)
    )
  );

-- ================= education =================
DROP POLICY IF EXISTS education_owner_all ON public.education;
CREATE POLICY education_owner_all ON public.education
  FOR ALL TO authenticated
  USING (public.owns_candidate(candidate_id) OR public.is_admin())
  WITH CHECK (public.owns_candidate(candidate_id) OR public.is_admin());

DROP POLICY IF EXISTS education_employer_read ON public.education;
CREATE POLICY education_employer_read ON public.education
  FOR SELECT TO authenticated
  USING (public.candidate_is_visible(candidate_id) AND public.is_verified_employer());

-- ================= skills (reference table) =================
DROP POLICY IF EXISTS skills_read_auth ON public.skills;
CREATE POLICY skills_read_auth ON public.skills
  FOR SELECT TO authenticated
  USING (true);  -- needed by candidate forms + matching; no PII inside

DROP POLICY IF EXISTS skills_admin_write ON public.skills;
CREATE POLICY skills_admin_write ON public.skills
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS skills_admin_update ON public.skills;
CREATE POLICY skills_admin_update ON public.skills
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS skills_admin_delete ON public.skills;
CREATE POLICY skills_admin_delete ON public.skills
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ================= candidate_skills =================
DROP POLICY IF EXISTS cskills_owner_all ON public.candidate_skills;
CREATE POLICY cskills_owner_all ON public.candidate_skills
  FOR ALL TO authenticated
  USING (public.owns_candidate(candidate_id) OR public.is_admin())
  WITH CHECK (public.owns_candidate(candidate_id) OR public.is_admin());

DROP POLICY IF EXISTS cskills_employer_read ON public.candidate_skills;
CREATE POLICY cskills_employer_read ON public.candidate_skills
  FOR SELECT TO authenticated
  USING (public.candidate_is_visible(candidate_id) AND public.is_verified_employer());

-- ================= profile_chunks =================
DROP POLICY IF EXISTS chunks_owner_all ON public.profile_chunks;
CREATE POLICY chunks_owner_all ON public.profile_chunks
  FOR ALL TO authenticated
  USING (public.owns_candidate(candidate_id) OR public.is_admin())
  WITH CHECK (public.owns_candidate(candidate_id) OR public.is_admin());

DROP POLICY IF EXISTS chunks_employer_read ON public.profile_chunks;
CREATE POLICY chunks_employer_read ON public.profile_chunks
  FOR SELECT TO authenticated
  USING (public.candidate_is_visible(candidate_id) AND public.is_verified_employer());

-- ================= employers =================
DROP POLICY IF EXISTS employers_owner_all ON public.employers;
CREATE POLICY employers_owner_all ON public.employers
  FOR ALL TO authenticated
  USING (user_id = public.my_user_id() OR public.is_admin())
  WITH CHECK (user_id = public.my_user_id() OR public.is_admin());

-- ================= jobs =================
-- Owning employer: full control. Other verified employers: read active
-- jobs (market transparency). Admins: everything.
DROP POLICY IF EXISTS jobs_owner_all ON public.jobs;
CREATE POLICY jobs_owner_all ON public.jobs
  FOR ALL TO authenticated
  USING (
    employer_id = public.my_verified_employer_id()
    OR EXISTS (SELECT 1 FROM public.employers e
               WHERE e.id = employer_id AND e.user_id = public.my_user_id())
    OR public.is_admin()
  )
  WITH CHECK (
    employer_id = public.my_verified_employer_id()
    OR EXISTS (SELECT 1 FROM public.employers e
               WHERE e.id = employer_id AND e.user_id = public.my_user_id())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS jobs_employer_read_active ON public.jobs;
CREATE POLICY jobs_employer_read_active ON public.jobs
  FOR SELECT TO authenticated
  USING (status = 'active' AND public.is_verified_employer());

-- ================= job_requirements =================
DROP POLICY IF EXISTS jobreq_owner_all ON public.job_requirements;
CREATE POLICY jobreq_owner_all ON public.job_requirements
  FOR ALL TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        AND (j.employer_id = public.my_verified_employer_id()
             OR EXISTS (SELECT 1 FROM public.employers e
                        WHERE e.id = j.employer_id AND e.user_id = public.my_user_id()))
    )
  )
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id
        AND (j.employer_id = public.my_verified_employer_id()
             OR EXISTS (SELECT 1 FROM public.employers e
                        WHERE e.id = j.employer_id AND e.user_id = public.my_user_id()))
    )
  );

DROP POLICY IF EXISTS jobreq_employer_read ON public.job_requirements;
CREATE POLICY jobreq_employer_read ON public.job_requirements
  FOR SELECT TO authenticated
  USING (
    public.is_verified_employer() AND EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.status = 'active'
    )
  );

-- ================= searches =================
DROP POLICY IF EXISTS searches_owner_all ON public.searches;
CREATE POLICY searches_owner_all ON public.searches
  FOR ALL TO authenticated
  USING (employer_id = public.my_verified_employer_id() OR public.is_admin())
  WITH CHECK (employer_id = public.my_verified_employer_id() OR public.is_admin());

-- ================= candidate_matches =================
-- Owning employer + admin write; candidate can READ rows about themselves.
DROP POLICY IF EXISTS matches_owner_all ON public.candidate_matches;
CREATE POLICY matches_owner_all ON public.candidate_matches
  FOR ALL TO authenticated
  USING (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.searches s
      WHERE s.id = search_id AND s.employer_id = public.my_verified_employer_id()
    ) OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.employer_id = public.my_verified_employer_id()
    )
  )
  WITH CHECK (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.searches s
      WHERE s.id = search_id AND s.employer_id = public.my_verified_employer_id()
    ) OR EXISTS (
      SELECT 1 FROM public.jobs j
      WHERE j.id = job_id AND j.employer_id = public.my_verified_employer_id()
    )
  );

DROP POLICY IF EXISTS matches_candidate_read ON public.candidate_matches;
CREATE POLICY matches_candidate_read ON public.candidate_matches
  FOR SELECT TO authenticated
  USING (candidate_id = public.my_candidate_id());

-- ================= shortlists =================
DROP POLICY IF EXISTS shortlists_owner_all ON public.shortlists;
CREATE POLICY shortlists_owner_all ON public.shortlists
  FOR ALL TO authenticated
  USING (employer_id = public.my_verified_employer_id() OR public.is_admin())
  WITH CHECK (employer_id = public.my_verified_employer_id() OR public.is_admin());

DROP POLICY IF EXISTS shortlists_candidate_read ON public.shortlists;
CREATE POLICY shortlists_candidate_read ON public.shortlists
  FOR SELECT TO authenticated
  USING (candidate_id = public.my_candidate_id());

-- ================= contact_log (audit, not a gate) =================
DROP POLICY IF EXISTS contactlog_employer_all ON public.contact_log;
CREATE POLICY contactlog_employer_all ON public.contact_log
  FOR ALL TO authenticated
  USING (employer_id = public.my_verified_employer_id() OR public.is_admin())
  WITH CHECK (employer_id = public.my_verified_employer_id() OR public.is_admin());

-- Candidates see who contacted/viewed them (transparency).
DROP POLICY IF EXISTS contactlog_candidate_read ON public.contact_log;
CREATE POLICY contactlog_candidate_read ON public.contact_log
  FOR SELECT TO authenticated
  USING (candidate_id = public.my_candidate_id());

-- ================= audit_logs =================
-- Anyone signed in may insert (app logs views/contacts/exports);
-- only admins (and service_role) may read.
DROP POLICY IF EXISTS audit_insert_auth ON public.audit_logs;
CREATE POLICY audit_insert_auth ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS audit_admin_read ON public.audit_logs;
CREATE POLICY audit_admin_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- =============================================================
-- 4. GRANTS (RLS still enforced; anon gets nothing usable)
-- =============================================================
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
-- Least-privilege correction: match_chunks is service-role-only (granted in
-- match_chunks.sql). Re-running this file must not reopen it.
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'match_chunks'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, public', r.oid::regprocedure);
  END LOOP;
END $$;

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
CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw_nn
  ON public.profile_chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_job_req_embedding_hnsw_nn
  ON public.job_requirements USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64)
  WHERE embedding IS NOT NULL;
