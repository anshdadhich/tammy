CREATE TABLE IF NOT EXISTS public.employer_quotas (
  employer_id UUID PRIMARY KEY REFERENCES public.employers(id) ON DELETE CASCADE,
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'basic', 'pro')),
  search_limit INT NOT NULL DEFAULT 25 CHECK (search_limit >= 0),
  cycle_started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employer_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotas_owner_all ON public.employer_quotas;
CREATE POLICY quotas_owner_all ON public.employer_quotas
  FOR ALL TO authenticated
  USING (employer_id = public.my_verified_employer_id() OR public.is_admin())
  WITH CHECK (public.is_admin());
