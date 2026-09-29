CREATE INDEX IF NOT EXISTS idx_candidates_contact_email_exact
  ON public.candidates (contact_email);
