CREATE OR REPLACE FUNCTION public.prevent_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (auth.jwt() ->> 'role') = 'service_role' OR auth.jwt() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_TABLE_NAME = 'users' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.role NOT IN ('candidate', 'employer') THEN
        RAISE EXCEPTION 'role assignment not allowed';
      END IF;
    ELSE
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        RAISE EXCEPTION 'role change not allowed';
      END IF;
      IF NEW.auth_id IS DISTINCT FROM OLD.auth_id THEN
        RAISE EXCEPTION 'auth link change not allowed';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'employers' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.verification_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'employers must be created pending';
      END IF;
    ELSE
      IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        RAISE EXCEPTION 'verification change not allowed';
      END IF;
      IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
        RAISE EXCEPTION 'employer owner change not allowed';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_no_escalation ON public.users;
CREATE TRIGGER trg_users_no_escalation
  BEFORE INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();

DROP TRIGGER IF EXISTS trg_employers_no_self_verify ON public.employers;
CREATE TRIGGER trg_employers_no_self_verify
  BEFORE INSERT OR UPDATE ON public.employers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_privilege_escalation();
