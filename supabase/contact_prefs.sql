-- Per-channel contact visibility (candidate chooses what HR sees).
-- Run in Supabase SQL Editor. Idempotent.
-- Privacy-by-default: new profiles hide every channel until opted in.
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS show_email BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS show_phone BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS show_linkedin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS show_github BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS show_portfolio BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS show_resume BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS show_photo BOOLEAN NOT NULL DEFAULT FALSE;
