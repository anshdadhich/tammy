-- match_chunks RPC for /api/search vector ranking.
-- Run in Supabase SQL Editor after schema.sql.
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
  LIMIT match_count;
$$;

-- Allow authenticated + service_role to call (anon blocked by RLS default, open as needed)
GRANT EXECUTE ON FUNCTION public.match_chunks(vector(1024), INT) TO authenticated, service_role;
