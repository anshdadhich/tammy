# 03 - Database vs .txt, Architecture, Full Schema

## Decision: database as source of truth
Use **PostgreSQL** as source of truth. Do NOT use .txt as primary.

Why not .txt primary:
- filtering hard, structured search hard, privacy hard, updates messy, duplicates, scaling painful
- Can't answer: "backend Bangalore 2y+ remote <80k with payments experience"

Best setup:
1. **PostgreSQL** (or Supabase Postgres) - structured fields
2. **pgvector** in Postgres - vector search. Alternative: Qdrant/Weaviate if separate vector DB needed. MVP: Postgres + pgvector is simplest strongest.
3. **Object storage** (S3 / R2 / Supabase Storage) - resume PDFs, photos, portfolio, exported .md/.txt
4. **Generated summary** - stored in DB as markdown text, optionally exported as .md file. Secondary artifact only.

Layering:
- DB: structured data, skills, embeddings, privacy, jobs, searches, matches, shortlists, contact logs, audit
- Generated markdown: display + LLM context + export
- File storage: binaries + optional exported summaries
- Vector index: embeddings of chunks for semantic search

## Full tables (with SQL sketch)

```sql
-- users: auth + role
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  auth_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('candidate','employer','admin')),
  status TEXT DEFAULT 'active',
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  full_name TEXT NOT NULL,
  headline TEXT,
  domain TEXT,
  current_role TEXT,
  total_experience_years NUMERIC,
  education_level TEXT,
  location_city TEXT,
  location_country TEXT,
  remote_preference TEXT, -- remote_only, hybrid, onsite, flexible
  open_to_relocation BOOLEAN DEFAULT FALSE,
  min_salary NUMERIC,
  salary_currency TEXT DEFAULT 'INR',
  salary_frequency TEXT DEFAULT 'monthly', -- monthly/yearly/hourly/stipend
  salary_negotiable BOOLEAN DEFAULT TRUE,
  notice_period TEXT,
  availability_status TEXT, -- immediate, notice, inactive
  photo_url TEXT,
  visibility_status TEXT DEFAULT 'visible', -- visible, hidden, inactive
  consent_status TEXT,
  profile_strength INT,
  freshness_updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE candidate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  summary_markdown TEXT,
  summary_json JSONB,
  original_resume_text TEXT,
  profile_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE work_experiences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  company_name TEXT,
  job_title TEXT,
  employment_type TEXT,
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN DEFAULT FALSE,
  description TEXT,
  achievements TEXT,
  tech_stack TEXT[],
  evidence_links TEXT[]
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  problem_statement TEXT,
  tech_stack TEXT[],
  role_in_project TEXT,
  project_link TEXT,
  repo_link TEXT,
  deployment_link TEXT,
  impact_summary TEXT,
  metrics TEXT,
  challenges_faced TEXT,
  project_type TEXT, -- personal, academic, freelance, production, open_source, prototype
  start_date DATE,
  end_date DATE
);

CREATE TABLE project_depth_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  complexity_score INT CHECK (complexity_score BETWEEN 1 AND 10),
  technical_complexity TEXT, -- low, medium, high, very_high
  architectural_concepts TEXT[],
  business_impact TEXT,
  autonomy_level TEXT, -- solo, contributed, led, unknown
  evidence_quality TEXT, -- weak, moderate, strong
  project_maturity TEXT,
  relevance_tags TEXT[],
  estimated_seniority_signal TEXT, -- intern, junior, mid, senior, unknown
  raw_ai_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  institution TEXT,
  degree TEXT,
  field_of_study TEXT,
  start_year INT,
  end_year INT,
  achievements TEXT
);

CREATE TABLE skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL, -- canonical: JavaScript, React, PostgreSQL
  aliases TEXT[],
  category TEXT
);

CREATE TABLE candidate_skills (
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id),
  experience_years NUMERIC,
  proficiency_level TEXT,
  source TEXT, -- self_reported, extracted, verified
  evidence_strength INT,
  PRIMARY KEY (candidate_id, skill_id)
);

-- pgvector: enable with CREATE EXTENSION vector;
CREATE TABLE profile_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
  chunk_type TEXT, -- summary, experience, project, education, skills
  content_text TEXT NOT NULL,
  metadata_json JSONB,
  embedding vector(1536), -- dim depends on model
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE employers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  company_name TEXT NOT NULL,
  company_email TEXT,
  website TEXT,
  company_size TEXT,
  industry TEXT,
  verification_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID REFERENCES employers(id),
  title TEXT NOT NULL,
  domain TEXT,
  seniority TEXT,
  description TEXT,
  responsibilities TEXT,
  must_have_skills TEXT[],
  nice_to_have_skills TEXT[],
  min_experience NUMERIC,
  max_experience NUMERIC,
  salary_min NUMERIC,
  salary_max NUMERIC,
  salary_currency TEXT DEFAULT 'INR',
  location TEXT,
  remote_policy TEXT,
  employment_type TEXT,
  start_date DATE,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE job_requirements (
  job_id UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  must_have TEXT[],
  nice_to_have TEXT[],
  seniority TEXT,
  domain TEXT,
  location TEXT,
  salary_range JSONB,
  remote_policy TEXT,
  core_responsibilities TEXT[],
  implied_technical_needs TEXT[],
  full_parsed JSONB,
  embedding vector(1536)
);

CREATE TABLE searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID REFERENCES employers(id),
  job_id UUID REFERENCES jobs(id),
  query_text TEXT,
  filters_json JSONB,
  result_count INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE candidate_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id UUID REFERENCES searches(id),
  job_id UUID REFERENCES jobs(id),
  candidate_id UUID REFERENCES candidates(id),
  score NUMERIC,
  sub_scores JSONB,
  match_reasons_json JSONB,
  status TEXT DEFAULT 'shown', -- shown, shortlisted, contacted, rejected, hired
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE shortlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID REFERENCES employers(id),
  candidate_id UUID REFERENCES candidates(id),
  job_id UUID REFERENCES jobs(id),
  status TEXT DEFAULT 'saved',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- In open-contact model: contact_requests becomes contact_log (no accept needed) but kept for audit
CREATE TABLE contact_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID REFERENCES employers(id),
  candidate_id UUID REFERENCES candidates(id),
  job_id UUID REFERENCES jobs(id),
  channel TEXT, -- email, phone, platform
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  action TEXT, -- view, search, shortlist, contact_view, export
  target_type TEXT,
  target_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Indexes to add: candidates(domain, visibility_status, min_salary), candidate_skills(skill_id), profile_chunks with ivfflat/hnsw on embedding, jobs(employer_id), audit_logs(actor_id, created_at).
