BEGIN;

-- 1. ACTUALIZAR TRIGGER GENERAL PARA CAPTURAR IP Y ROL
CREATE OR REPLACE FUNCTION fge_private.auditar_registro() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  anterior jsonb;
  posterior jsonb;
  fila jsonb;
  clave jsonb := '{}'::jsonb;
  nombre_columna text;
  actor_invocador text := COALESCE(
    NULLIF(NULLIF(current_setting('role', true), 'none'), ''),
    session_user
  );
  -- Nuevas variables para IP y Rol
  asignacion uuid;
  codigo text;
  encabezados jsonb;
  ip inet;
  fuente text;
BEGIN
  IF TG_OP <> 'INSERT' THEN anterior := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN posterior := to_jsonb(NEW); END IF;
  fila := coalesce(posterior, anterior);
  FOREACH nombre_columna IN ARRAY TG_ARGV LOOP
    clave := clave || jsonb_build_object(nombre_columna, fila -> nombre_columna);
  END LOOP;

  -- Capturar el Rol activo del usuario
  SELECT ar.id_asignacion, rol.codigo INTO asignacion, codigo
  FROM public.asignaciones_roles ar JOIN public.roles rol USING (id_rol)
  WHERE ar.id_usuario = auth.uid() AND ar.revocado_at IS NULL AND ar.archived_at IS NULL
    AND rol.activo AND rol.archived_at IS NULL
  ORDER BY CASE rol.codigo WHEN 'ADMIN' THEN 0 ELSE 1 END, ar.id_asignacion LIMIT 1;

  -- Capturar la IP (desde los headers de la app o la conexión directa)
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
    (tabla_afectada, clave_registro, tipo_accion, id_usuario, actor_sql, antes, despues, id_asignacion, codigo_rol, ip_origen, fuente_ip)
  VALUES
    (TG_TABLE_NAME, clave, TG_OP, auth.uid(), actor_invocador, anterior, posterior, asignacion, codigo, ip, fuente);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.auditar_registro() FROM PUBLIC, anon, authenticated;

-- 2. FUNCIÓN PARA REGISTRAR EVENTOS DE AUTENTICACIÓN
CREATE OR REPLACE FUNCTION public.registrar_evento_autenticacion(
  p_exitoso boolean,
  p_detalles jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  usuario uuid := auth.uid();
  actor text := COALESCE(NULLIF(NULLIF(current_setting('role', true), 'none'), ''), session_user);
  encabezados jsonb;
  ip inet;
  fuente text;
BEGIN
  -- Intentar capturar IP
  BEGIN
    encabezados := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    ip := nullif(encabezados->>'x-fge-ip-origen', '')::inet;
    IF ip IS NOT NULL THEN fuente := 'aplicacion'; END IF;
  EXCEPTION WHEN invalid_text_representation THEN ip := NULL;
  END;
  IF ip IS NULL THEN ip := inet_client_addr(); IF ip IS NOT NULL THEN fuente := 'conexion_bd'; END IF; END IF;

  -- Usamos 'INSERT' por la restricción de la tabla, y guardamos el detalle en 'despues'
  INSERT INTO fge_private.historial_cambios (
    tabla_afectada, clave_registro, tipo_accion, id_usuario, actor_sql, despues, ip_origen, fuente_ip
  ) VALUES (
    'autenticacion',
    jsonb_build_object('exitoso', p_exitoso),
    'INSERT',
    usuario,
    actor,
    jsonb_build_object('operacion', 'login', 'detalles', p_detalles),
    ip,
    fuente
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_evento_autenticacion(boolean, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_evento_autenticacion(boolean, jsonb) TO authenticated;

-- 3. FUNCIÓN PARA REGISTRAR LECTURA DE DOCUMENTOS LEGALES
CREATE OR REPLACE FUNCTION public.registrar_acceso_documento(
  p_id_documento uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  usuario uuid := auth.uid();
  actor text := COALESCE(NULLIF(NULLIF(current_setting('role', true), 'none'), ''), session_user);
  asignacion uuid;
  codigo text;
  encabezados jsonb;
  ip inet;
  fuente text;
BEGIN
  IF usuario IS NULL THEN RAISE EXCEPTION 'Sesión requerida.' USING ERRCODE = '42501'; END IF;

  SELECT ar.id_asignacion, rol.codigo INTO asignacion, codigo
  FROM public.asignaciones_roles ar JOIN public.roles rol USING (id_rol)
  WHERE ar.id_usuario = usuario AND ar.revocado_at IS NULL ORDER BY CASE rol.codigo WHEN 'ADMIN' THEN 0 ELSE 1 END LIMIT 1;

  -- Intentar capturar IP
  BEGIN
    encabezados := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
    ip := nullif(encabezados->>'x-fge-ip-origen', '')::inet;
    IF ip IS NOT NULL THEN fuente := 'aplicacion'; END IF;
  EXCEPTION WHEN invalid_text_representation THEN ip := NULL;
  END;
  IF ip IS NULL THEN ip := inet_client_addr(); IF ip IS NOT NULL THEN fuente := 'conexion_bd'; END IF; END IF;

  INSERT INTO fge_private.historial_cambios (
    tabla_afectada, clave_registro, tipo_accion, id_usuario, actor_sql, despues, id_asignacion, codigo_rol, ip_origen, fuente_ip
  ) VALUES (
    'informacion_legal',
    jsonb_build_object('id_informacion_legal', p_id_documento),
    'INSERT',
    usuario,
    actor,
    jsonb_build_object('operacion', 'lectura_documento'),
    asignacion,
    codigo,
    ip,
    fuente
  );
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_acceso_documento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_acceso_documento(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;