BEGIN;

CREATE OR REPLACE FUNCTION public.archivar_plan_seguro(p_id uuid, p_version bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE registro public.planes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501'; END IF;
  SELECT * INTO registro FROM public.planes WHERE id_plan = p_id FOR UPDATE;
  IF NOT FOUND OR NOT fge_private.usuario_puede_gestionar_organizacion(registro.id_organizacion) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR p_version < 1 OR registro.archived_at IS NOT NULL OR registro.version <> p_version THEN
    RAISE EXCEPTION 'Registro desactualizado' USING ERRCODE = '40001';
  END IF;
  UPDATE public.acciones SET archived_at = now() WHERE id_plan = p_id AND archived_at IS NULL;
  UPDATE public.planes SET archived_at = now() WHERE id_plan = p_id;
  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archivar_accion_seguro(p_id uuid, p_version bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE registro public.acciones%ROWTYPE;
        plan public.planes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501'; END IF;
  SELECT * INTO registro FROM public.acciones WHERE id_accion = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501'; END IF;
  SELECT * INTO plan FROM public.planes WHERE id_plan = registro.id_plan FOR SHARE;
  IF NOT FOUND OR plan.archived_at IS NOT NULL OR NOT fge_private.usuario_puede_gestionar_organizacion(plan.id_organizacion) THEN
    RAISE EXCEPTION 'Sin permiso' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO registro FROM public.acciones WHERE id_accion = p_id FOR UPDATE;
  IF NOT FOUND OR registro.id_plan <> plan.id_plan OR p_version IS NULL OR p_version < 1 OR registro.archived_at IS NOT NULL OR registro.version <> p_version THEN
    RAISE EXCEPTION 'Registro desactualizado' USING ERRCODE = '40001';
  END IF;
  UPDATE public.acciones SET archived_at = now() WHERE id_accion = p_id;
  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archivar_plan_seguro(uuid, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archivar_accion_seguro(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archivar_plan_seguro(uuid, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivar_accion_seguro(uuid, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION fge_private.exigir_plan_activo_accion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE archivado timestamptz;
BEGIN
  SELECT archived_at INTO archivado FROM public.planes WHERE id_plan = NEW.id_plan FOR SHARE;
  IF NOT FOUND OR archivado IS NOT NULL THEN
    RAISE EXCEPTION 'El plan no está disponible' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.exigir_plan_activo_accion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS acciones_exigir_plan_activo ON public.acciones;
CREATE TRIGGER acciones_exigir_plan_activo
BEFORE INSERT OR UPDATE OF id_plan ON public.acciones
FOR EACH ROW EXECUTE FUNCTION fge_private.exigir_plan_activo_accion();

NOTIFY pgrst, 'reload schema';
COMMIT;
