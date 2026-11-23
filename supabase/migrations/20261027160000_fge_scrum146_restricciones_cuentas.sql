BEGIN;

CREATE OR REPLACE FUNCTION fge_private.registrar_intento_rol_no_autorizado(
  p_actor uuid, p_operacion text
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO fge_private.intentos_administracion_coordinadores(id_usuario, operacion)
  VALUES (p_actor, left(p_operacion, 40));
$$;

CREATE OR REPLACE FUNCTION fge_private.proteger_asignaciones_roles()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor uuid := auth.uid();
  old_admin boolean := false;
  new_admin boolean := false;
  administradores_activos integer;
BEGIN
  IF actor IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.asignaciones_roles a
    JOIN public.roles r USING (id_rol) JOIN public.perfiles p USING (id_usuario)
    WHERE a.id_usuario = actor AND a.revocado_at IS NULL AND a.archived_at IS NULL
      AND r.codigo = 'COORD' AND r.activo AND r.archived_at IS NULL
      AND p.activo AND p.archived_at IS NULL
  ) THEN
    PERFORM fge_private.registrar_intento_rol_no_autorizado(actor, 'rol:' || TG_OP);
    RAISE EXCEPTION 'Un Coordinador no puede administrar roles' USING ERRCODE = '42501';
  END IF;

  IF TG_OP <> 'INSERT' THEN
    SELECT r.codigo = 'ADMIN' AND OLD.alcance = 'global'
      AND OLD.revocado_at IS NULL AND OLD.archived_at IS NULL
    INTO old_admin FROM public.roles r WHERE r.id_rol = OLD.id_rol;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    SELECT r.codigo = 'ADMIN' AND NEW.alcance = 'global'
      AND NEW.revocado_at IS NULL AND NEW.archived_at IS NULL
    INTO new_admin FROM public.roles r WHERE r.id_rol = NEW.id_rol;
  END IF;

  IF new_admin AND NOT old_admin THEN
    PERFORM pg_advisory_xact_lock(146);
  END IF;
  IF new_admin AND NOT old_admin AND EXISTS (
    SELECT 1 FROM public.asignaciones_roles a JOIN public.roles r USING (id_rol)
    WHERE r.codigo = 'ADMIN' AND a.alcance = 'global'
      AND a.revocado_at IS NULL AND a.archived_at IS NULL
      AND a.id_usuario <> NEW.id_usuario
  ) THEN
    RAISE EXCEPTION 'Ya existe una cuenta Administrador activa' USING ERRCODE = 'P0153';
  END IF;

  IF old_admin AND NOT new_admin THEN
    SELECT count(*) INTO administradores_activos
    FROM public.asignaciones_roles a JOIN public.roles r USING (id_rol)
    JOIN public.perfiles p USING (id_usuario)
    WHERE r.codigo = 'ADMIN' AND a.alcance = 'global'
      AND a.revocado_at IS NULL AND a.archived_at IS NULL
      AND p.activo AND p.archived_at IS NULL;
    IF administradores_activos <= 1 THEN
      RAISE EXCEPTION 'No se puede desactivar el ultimo Administrador activo' USING ERRCODE = 'P0152';
    END IF;
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS proteger_asignaciones_roles ON public.asignaciones_roles;
CREATE TRIGGER proteger_asignaciones_roles
  BEFORE INSERT OR UPDATE OR DELETE ON public.asignaciones_roles
  FOR EACH ROW EXECUTE FUNCTION fge_private.proteger_asignaciones_roles();

REVOKE ALL ON FUNCTION fge_private.registrar_intento_rol_no_autorizado(uuid,text),
  fge_private.proteger_asignaciones_roles() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION fge_private.proteger_estado_administrador()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE administradores_activos integer;
BEGIN
  IF OLD.activo AND NOT NEW.activo AND EXISTS (
    SELECT 1 FROM public.asignaciones_roles a JOIN public.roles r USING (id_rol)
    WHERE a.id_usuario = OLD.id_usuario AND r.codigo = 'ADMIN'
      AND a.alcance = 'global' AND a.revocado_at IS NULL AND a.archived_at IS NULL
  ) THEN
    SELECT count(*) INTO administradores_activos
    FROM public.perfiles p JOIN public.asignaciones_roles a USING (id_usuario)
    JOIN public.roles r USING (id_rol)
    WHERE p.activo AND p.archived_at IS NULL AND r.codigo = 'ADMIN'
      AND a.alcance = 'global' AND a.revocado_at IS NULL AND a.archived_at IS NULL;
    IF administradores_activos <= 1 THEN
      RAISE EXCEPTION 'No se puede desactivar el ultimo Administrador activo' USING ERRCODE = 'P0152';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_estado_administrador ON public.perfiles;
CREATE TRIGGER proteger_estado_administrador
  BEFORE UPDATE ON public.perfiles
  FOR EACH ROW EXECUTE FUNCTION fge_private.proteger_estado_administrador();

REVOKE ALL ON FUNCTION fge_private.proteger_estado_administrador() FROM PUBLIC, anon, authenticated;
COMMIT;
