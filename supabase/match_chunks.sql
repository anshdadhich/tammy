-- match_chunks RPC for /api/search vector ranking.
-- Run in Supabase SQL Editor after schema.sql.
-- Clamped to 200 rows max so callers can't force a full-table sort (DoS).
CREATE OR REPLACE FUNCTION public.match_chunks(query_embedding vector(1024), match_count INT DEFAULT 30)
RETURNS TABLE (
  chunk_id UUID,
  candidate_id UUID,
  chunk_type TEXT,
  content_text TEXT,
  distance FLOAT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pc.id, pc.candidate_id, pc.chunk_type, pc.content_text,
         (pc.embedding <=> query_embedding)::float AS distance
  FROM public.profile_chunks pc
  JOIN public.candidates c ON c.id = pc.candidate_id
  WHERE pc.embedding IS NOT NULL
    AND c.visibility_status = 'visible'
  ORDER BY pc.embedding <=> query_embedding
  LIMIT LEAST(GREATEST(match_count, 1), 200);
$$;

-- NOTE: SECURITY DEFINER bypasses RLS on profile_chunks/candidates.
-- The function intentionally filters to visible candidates only, but it does
-- NOT verify the caller is a verified employer. Treat it as visible-candidate
-- search for any authenticated user; the app layer must gate PII (contact_*)
-- via show_* flags and HR sessions. Do NOT grant to anon.
GRANT EXECUTE ON FUNCTION public.match_chunks(vector(1024), INT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.match_chunks(vector(1024), INT) FROM anon, public;
