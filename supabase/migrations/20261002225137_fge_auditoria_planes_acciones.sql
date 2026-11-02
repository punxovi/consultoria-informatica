-- SCRUM-84/87: contexto de RF62 para las escrituras de Planes y Acciones.
BEGIN;
ALTER TABLE fge_private.historial_cambios
  ADD COLUMN codigo_rol text,
  ADD COLUMN id_pais uuid REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  ADD COLUMN ip_origen inet,
  ADD COLUMN fuente_ip text CHECK (fuente_ip IN ('aplicacion','conexion_bd'));
CREATE INDEX historial_pais_idx ON fge_private.historial_cambios(id_pais);

CREATE FUNCTION fge_private.auditar_plan_accion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  anterior jsonb;
  posterior jsonb;
  fila jsonb;
  pais uuid;
  asignacion uuid;
  codigo text;
  encabezados jsonb;
  ip inet;
  fuente text;
  actor text := coalesce(nullif(nullif(current_setting('role', true), 'none'), ''), session_user);
BEGIN
  IF TG_OP <> 'INSERT' THEN anterior := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN posterior := to_jsonb(NEW); END IF;
  fila := coalesce(posterior, anterior);
  IF TG_TABLE_NAME = 'planes' THEN
    SELECT org.id_pais INTO pais FROM public.organizaciones org WHERE org.id_organizacion = (fila->>'id_organizacion')::uuid;
  ELSE
    SELECT org.id_pais INTO pais FROM public.planes plan JOIN public.organizaciones org USING (id_organizacion)
    WHERE plan.id_plan = (fila->>'id_plan')::uuid;
  END IF;
  SELECT ar.id_asignacion, rol.codigo INTO asignacion, codigo
  FROM public.asignaciones_roles ar JOIN public.roles rol USING (id_rol)
  WHERE ar.id_usuario = auth.uid() AND ar.revocado_at IS NULL AND ar.archived_at IS NULL
    AND rol.activo AND rol.archived_at IS NULL
    AND (rol.codigo = 'ADMIN' OR (rol.codigo = 'COORD' AND (ar.alcance = 'global' OR ar.id_pais = pais)))
  ORDER BY CASE rol.codigo WHEN 'ADMIN' THEN 0 ELSE 1 END, ar.id_asignacion LIMIT 1;

  -- La IP es contexto informativo de la petición; nunca interviene en RLS.
  -- La aplicación envía la dirección obtenida del adaptador de servidor.
  BEGIN
    encabezados := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    ip := nullif(encabezados->>'x-fge-ip-origen', '')::inet;
    IF ip IS NOT NULL THEN fuente := 'aplicacion'; END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    ip := NULL;
  END;
  IF ip IS NULL THEN
    ip := inet_client_addr();
    IF ip IS NOT NULL THEN fuente := 'conexion_bd'; END IF;
  END IF;

  INSERT INTO fge_private.historial_cambios
    (tabla_afectada,clave_registro,tipo_accion,id_usuario,id_asignacion,permiso_ejercido,actor_sql,antes,despues,codigo_rol,id_pais,ip_origen,fuente_ip)
  VALUES
    (TG_TABLE_NAME,jsonb_build_object(TG_ARGV[0],fila->TG_ARGV[0]),TG_OP,auth.uid(),asignacion,
     CASE WHEN codigo IS NOT NULL THEN codigo || ':' || TG_TABLE_NAME || ':' || TG_OP END,
     actor,anterior,posterior,codigo,pais,ip,fuente);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.auditar_plan_accion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER auditar ON public.planes;
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.planes
FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_plan_accion('id_plan');
DROP TRIGGER auditar ON public.acciones;
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.acciones
FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_plan_accion('id_accion');
COMMIT;
