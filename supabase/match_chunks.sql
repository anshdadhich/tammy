DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'match_chunks'
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig; END LOOP;
END $$;

CREATE FUNCTION public.match_chunks(
  query_embedding vector(1024),
  match_count INT DEFAULT 30,
  p_domain TEXT DEFAULT NULL,
  p_min_exp NUMERIC DEFAULT NULL,
  p_salary_max NUMERIC DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_candidate_ids UUID[] DEFAULT NULL,
  p_availability TEXT DEFAULT NULL,
  p_chunk_types TEXT[] DEFAULT NULL,
  p_fts_terms TEXT[] DEFAULT NULL,
  p_per_candidate INT DEFAULT 3
)
RETURNS TABLE (
  chunk_id UUID,
  candidate_id UUID,
  chunk_type TEXT,
  content_text TEXT,
  metadata_json JSONB,
  distance FLOAT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT := LEAST(GREATEST(COALESCE(match_count, 30), 1), 200);
  v_per INT := LEAST(GREATEST(COALESCE(p_per_candidate, 3), 1), 10);
BEGIN
  PERFORM set_config('hnsw.ef_search', GREATEST(v_limit, 100)::text, true);
  RETURN QUERY
  WITH ranked AS (
    SELECT
      pc.id,
      pc.candidate_id,
      pc.chunk_type,
      pc.content_text,
      pc.metadata_json,
      (pc.embedding <=> query_embedding)::float AS dist,
      ROW_NUMBER() OVER (PARTITION BY pc.candidate_id ORDER BY pc.embedding <=> query_embedding) AS rn
    FROM public.profile_chunks pc
    JOIN public.candidates c ON c.id = pc.candidate_id
    WHERE pc.embedding IS NOT NULL
      AND c.visibility_status = 'visible'
      AND (p_candidate_ids IS NULL OR pc.candidate_id = ANY(p_candidate_ids))
      AND (p_chunk_types IS NULL OR pc.chunk_type = ANY(p_chunk_types))
      AND (p_domain IS NULL
        OR pc.metadata_json IS NULL
        OR pc.metadata_json = '{}'::jsonb
        OR (pc.metadata_json ? 'domain_tags' AND pc.metadata_json->'domain_tags' ? p_domain)
        OR (pc.metadata_json ? 'technologies' AND pc.metadata_json->'technologies' ? p_domain)
        OR (pc.metadata_json ? 'domain' AND pc.metadata_json->>'domain' = p_domain))
      AND (p_min_exp IS NULL OR c.total_experience_years IS NULL OR COALESCE(c.total_experience_years, 0) >= p_min_exp)
      AND (p_salary_max IS NULL OR c.min_salary IS NULL OR c.min_salary <= p_salary_max)
      AND (p_location IS NULL
        OR c.remote_preference IN ('remote_only', 'flexible')
        OR c.location_city ILIKE '%' || p_location || '%')
      AND (p_availability IS NULL OR c.availability_status = p_availability)
      AND (p_fts_terms IS NULL OR EXISTS (
        SELECT 1 FROM unnest(p_fts_terms) AS ft(term)
        WHERE to_tsvector('english', pc.content_text) @@ plainto_tsquery('english', ft.term)
      ))
    ORDER BY pc.embedding <=> query_embedding
    LIMIT v_limit * v_per
  )
  SELECT r.id, r.candidate_id, r.chunk_type, r.content_text, r.metadata_json, r.dist
  FROM ranked r
  WHERE r.rn <= v_per
  ORDER BY r.dist
  LIMIT v_limit;
END;
$$;

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'match_chunks'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.oid::regprocedure);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, public', r.oid::regprocedure);
  END LOOP;
END $$;
