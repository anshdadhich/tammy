-- =============================================================
-- Seed: demo data for local dev / screenshots / QA without API keys
-- Run AFTER (in order): schema.sql → seed_skills.sql → match_chunks.sql
--   → seed_demo.sql. Idempotent: safe to re-run (upserts on fixed UUIDs).
--
-- What it creates:
--   1 demo employer + 2 jobs (backend Node/Postgres, frontend React)
--   6 demo candidates (varied domains / exp / salary / remote_pref)
--   2 profile_chunks per candidate with fake 1024-dim ZERO vectors
--
-- NOTE on zero vectors: real embeddings come from Voyage (voyage-4-lite,
-- 1024 dims) via the Inngest pipeline. Zero vectors let the match_chunks
-- RPC + /hire UI return rows WITHOUT a VOYAGE_API_KEY (all distances tie
-- at ~1.0, so results fall back to recency order). Re-running the real
-- pipeline overwrites these with true embeddings. Demo rows use
-- @demo.local emails — delete them with:
--   DELETE FROM public.candidates WHERE contact_email LIKE '%@demo.local';
-- =============================================================

-- ---------- 0. demo employer ----------
INSERT INTO public.employers (id, company_name, company_email, website, company_size, industry, verification_status)
VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Demo Logistics Co', 'hiring@demo.local', 'https://demo.local', '11-50', 'Logistics', 'verified')
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  company_email = EXCLUDED.company_email,
  verification_status = 'verified';

-- ---------- 1. demo jobs ----------
INSERT INTO public.jobs (id, employer_id, title, domain, seniority, description, responsibilities, must_have_skills, nice_to_have_skills, min_experience, max_experience, salary_min, salary_max, salary_currency, location, remote_policy, employment_type, status)
VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Backend Developer (Node/Postgres)', 'Software Development', 'mid',
   'Build logistics APIs with Node.js and PostgreSQL. Own auth, schema design, Redis caching, and deployment. Realtime tracking with WebSockets is a plus.',
   'Design Postgres schemas; build REST APIs; add Redis caching; ship to production',
   ARRAY['Node.js','PostgreSQL'], ARRAY['Redis','Docker'],
   1, 4, 40000, 80000, 'INR', 'Remote', 'remote', 'full-time', 'active'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   'Frontend Developer (React)', 'Software Development', 'mid',
   'Build operator dashboards in React + TypeScript + Tailwind. Consume REST APIs, own loading/error states, and keep Lighthouse green.',
   'Build dashboard pages; integrate REST APIs; maintain design system usage',
   ARRAY['React','TypeScript'], ARRAY['Tailwind CSS','REST APIs'],
   2, 5, 50000, 90000, 'INR', 'Pune', 'hybrid', 'full-time', 'active')
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  must_have_skills = EXCLUDED.must_have_skills,
  nice_to_have_skills = EXCLUDED.nice_to_have_skills,
  status = 'active';

-- ---------- 2. demo candidates (varied domains/exp/salary/remote) ----------
INSERT INTO public.candidates
  (id, full_name, headline, domain, current_position, total_experience_years,
   location_city, location_country, remote_preference, open_to_relocation,
   min_salary, salary_currency, salary_frequency, salary_negotiable,
   availability_status, contact_email, contact_phone, linkedin_url, github_url,
   visibility_status, consent_status, profile_strength)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Asha Sharma', 'Node/Postgres APIs, auth + caching, 2y',
   'backend', 'SDE-1 @ Acme', 2, 'Pune', 'India', 'remote_only', false,
   45000, 'INR', 'monthly', true, 'immediate',
   'asha.backend@demo.local', '+91 98765 00001', 'https://linkedin.com/in/demo-asha', 'https://github.com/demo-asha',
   'visible', 'granted', 82),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'Rohan Mehta', 'React dashboards, design systems, 4y',
   'frontend', 'Frontend Dev @ BrightUI', 4, 'Bengaluru', 'India', 'hybrid', true,
   80000, 'INR', 'monthly', true, 'notice',
   'rohan.frontend@demo.local', '+91 98765 00002', 'https://linkedin.com/in/demo-rohan', 'https://github.com/demo-rohan',
   'visible', 'granted', 78),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'Priya Nair', 'ML pipelines, churn + forecasting, 5y',
   'data', 'Data Scientist @ Insightful', 5, 'Remote', 'India', 'remote_only', false,
   120000, 'INR', 'monthly', true, 'immediate',
   'priya.data@demo.local', '+91 98765 00003', 'https://linkedin.com/in/demo-priya', 'https://github.com/demo-priya',
   'visible', 'granted', 85),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'Karan Patel', 'Flutter apps, 100k installs, 1y',
   'mobile', 'Junior Mobile Dev @ AppWorks', 1, 'Ahmedabad', 'India', 'onsite', false,
   35000, 'INR', 'monthly', true, 'immediate',
   'karan.mobile@demo.local', '+91 98765 00004', 'https://linkedin.com/in/demo-karan', 'https://github.com/demo-karan',
   'visible', 'granted', 64),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'Sneha Kulkarni', 'K8s + AWS cost cuts, platform, 7y',
   'devops', 'Senior DevOps @ CloudNine', 7, 'Hyderabad', 'India', 'flexible', true,
   150000, 'INR', 'monthly', false, 'notice',
   'sneha.devops@demo.local', '+91 98765 00005', 'https://linkedin.com/in/demo-sneha', 'https://github.com/demo-sneha',
   'visible', 'granted', 90),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'Vikram Singh', 'Next.js + Supabase SaaS, solo-built, 3y',
   'fullstack', 'Full-stack Dev @ IndieHack', 3, 'Delhi', 'India', 'hybrid', true,
   70000, 'INR', 'monthly', true, 'immediate',
   'vikram.fullstack@demo.local', '+91 98765 00006', 'https://linkedin.com/in/demo-vikram', 'https://github.com/demo-vikram',
   'visible', 'granted', 76)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  headline = EXCLUDED.headline,
  domain = EXCLUDED.domain,
  total_experience_years = EXCLUDED.total_experience_years,
  remote_preference = EXCLUDED.remote_preference,
  min_salary = EXCLUDED.min_salary,
  visibility_status = 'visible';

-- ---------- 3. demo skills links (best-effort; skipped silently if skill missing) ----------
INSERT INTO public.candidate_skills (candidate_id, skill_id, experience_years, proficiency_level, source, evidence_strength)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', s.id, 2, 'advanced', 'extracted', 70 FROM public.skills s WHERE s.name IN ('Node.js','PostgreSQL','Redis')
ON CONFLICT DO NOTHING;
INSERT INTO public.candidate_skills (candidate_id, skill_id, experience_years, proficiency_level, source, evidence_strength)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', s.id, 4, 'advanced', 'extracted', 75 FROM public.skills s WHERE s.name IN ('React','TypeScript','Tailwind CSS')
ON CONFLICT DO NOTHING;
INSERT INTO public.candidate_skills (candidate_id, skill_id, experience_years, proficiency_level, source, evidence_strength)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', s.id, 5, 'expert', 'extracted', 80 FROM public.skills s WHERE s.name IN ('Python','Pandas','scikit-learn')
ON CONFLICT DO NOTHING;
INSERT INTO public.candidate_skills (candidate_id, skill_id, experience_years, proficiency_level, source, evidence_strength)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', s.id, 1, 'intermediate', 'extracted', 55 FROM public.skills s WHERE s.name IN ('Flutter','Kotlin')
ON CONFLICT DO NOTHING;
INSERT INTO public.candidate_skills (candidate_id, skill_id, experience_years, proficiency_level, source, evidence_strength)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', s.id, 7, 'expert', 'extracted', 85 FROM public.skills s WHERE s.name IN ('Docker','Kubernetes','AWS')
ON CONFLICT DO NOTHING;
INSERT INTO public.candidate_skills (candidate_id, skill_id, experience_years, proficiency_level, source, evidence_strength)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', s.id, 3, 'advanced', 'extracted', 70 FROM public.skills s WHERE s.name IN ('Next.js','Supabase','PostgreSQL')
ON CONFLICT DO NOTHING;

-- ---------- 4. profile_chunks with fake zero vectors (1024-dim) ----------
-- ('[' || repeat('0,',1023) || '0]')::vector(1024) builds a 1024-long zero
-- vector without pasting 1024 literals. match_chunks works (ties → any
-- order); replace by running the real embed pipeline.
DELETE FROM public.profile_chunks WHERE candidate_id IN
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6');

INSERT INTO public.profile_chunks (candidate_id, chunk_type, content_text, metadata_json, embedding, embedding_model, embedding_dim)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'summary', 'Backend developer, 2y. Node.js PostgreSQL Redis. Built delivery APIs, cut p95 800ms to 250ms via Redis caching. Open to remote.',
   '{"domain":"backend"}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'project', 'Project: Delivery tracker. Realtime tracking with Socket.io and Redis. Sole backend. 500 concurrent connections.',
   '{"technologies":["Node.js","PostgreSQL","Redis"]}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'summary', 'Frontend developer, 4y. React TypeScript Tailwind. Built operator dashboards used by 3 logistics teams. Design system contributor.',
   '{"domain":"frontend"}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2', 'project', 'Project: Fleet dashboard. React + TypeScript dashboard with 40+ views, virtualized tables, offline-safe mutations.',
   '{"technologies":["React","TypeScript"]}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'summary', 'Data scientist, 5y. Python scikit-learn Pandas. Churn model lifted retention 6%. Forecasting pipelines on 10M rows.',
   '{"domain":"data"}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3', 'project', 'Project: Churn predictor. Gradient boosting on usage features, SHAP explanations, weekly retrain pipeline.',
   '{"technologies":["Python","scikit-learn","Pandas"]}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'summary', 'Mobile developer, 1y. Flutter Dart. Shipped expense app with 100k installs, 4.6 rating. Firebase backend.',
   '{"domain":"mobile"}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4', 'project', 'Project: Expense app. Flutter offline-first with local sync, Firebase auth, crash-free 99.5%.',
   '{"technologies":["Flutter"]}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'summary', 'DevOps engineer, 7y. AWS Kubernetes Terraform. Cut infra spend 35%, led migration of 20 services to EKS with zero downtime.',
   '{"domain":"devops"}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa5', 'project', 'Project: EKS migration. Terraform modules, GitHub Actions pipelines, autoscaling policies for 20 services.',
   '{"technologies":["AWS","Kubernetes","Docker"]}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'summary', 'Full-stack developer, 3y. Next.js Supabase PostgreSQL. Solo-built invoicing SaaS with 200 paying users.',
   '{"domain":"fullstack"}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa6', 'project', 'Project: Invoice SaaS. Next.js + Supabase with RLS, Stripe billing, PDF generation. 200 paying users.',
   '{"technologies":["Next.js","Supabase","PostgreSQL"]}', ('[' || repeat('0,',1023) || '0]')::vector(1024), 'voyage-4-lite', 1024);
