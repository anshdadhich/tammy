-- Exact-match email lookups used by signup, lookup, and owner flows run as
-- `contact_email = '<lowercased>'`, which cannot use the expression index on
-- lower(contact_email). Plain btree covers them. Idempotent.
CREATE INDEX IF NOT EXISTS idx_candidates_contact_email_exact
  ON public.candidates (contact_email);
