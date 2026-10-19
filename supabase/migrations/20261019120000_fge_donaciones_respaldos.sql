-- SCRUM-133: Asociación de respaldos documentales a Donaciones
-- Permisos, políticas RLS para Donaciones y Archivos de respaldo (bucket fge-archivos).
BEGIN;

-- La consulta territorial debe aplicar el mismo alcance de COORD que la gestión.
CREATE OR REPLACE FUNCTION fge_private.usuario_puede_consultar_organizacion(
  p_id_organizacion uuid
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizaciones AS organizacion
    JOIN public.asignaciones_roles AS asignacion
      ON asignacion.id_usuario = auth.uid()
     AND asignacion.revocado_at IS NULL
     AND asignacion.archived_at IS NULL
    JOIN public.roles AS rol
      ON rol.id_rol = asignacion.id_rol
     AND rol.activo = true
     AND rol.archived_at IS NULL
    WHERE organizacion.id_organizacion = p_id_organizacion
      AND organizacion.archived_at IS NULL
      AND (
        rol.codigo = 'ADMIN'
        OR (
          rol.codigo IN ('COORD', 'INVIT')
          AND (
            asignacion.alcance = 'global'
            OR asignacion.id_pais = organizacion.id_pais
          )
        )
      )
  );
$$;

-- 1. Añadir columna tipo_respaldo a la tabla archivos para diferenciar subtipos de respaldo documental
-- (comprobante, acta_entrega, certificado, fotografia). La columna es nullable para mantener compatibilidad
-- con archivos de otros módulos (expediente legal, evidencias, etc.) que no usan tipo_respaldo.
ALTER TABLE public.archivos ADD COLUMN IF NOT EXISTS tipo_respaldo text
  CHECK (tipo_respaldo IS NULL OR tipo_respaldo IN ('comprobante','acta_entrega','certificado','fotografia','respaldo_donacion'));

-- 2. Habilitar permisos de Data API para Donaciones
GRANT SELECT, INSERT, UPDATE ON TABLE public.donaciones TO authenticated;

-- 2. Políticas RLS para Donaciones
DROP POLICY IF EXISTS donaciones_lectura ON public.donaciones;
CREATE POLICY donaciones_lectura
ON public.donaciones FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion)
);

DROP POLICY IF EXISTS donaciones_insert ON public.donaciones;
CREATE POLICY donaciones_insert
ON public.donaciones FOR INSERT TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
);

DROP POLICY IF EXISTS donaciones_update ON public.donaciones;
CREATE POLICY donaciones_update
ON public.donaciones FOR UPDATE TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
)
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
);

-- 3. Función auxiliar para verificar acceso a respaldos de donaciones
CREATE OR REPLACE FUNCTION fge_private.acceso_archivo_donacion(p_donacion uuid, p_gestion boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.donaciones d
    WHERE d.id_donacion = p_donacion
      AND d.archived_at IS NULL
      AND CASE
        WHEN p_gestion THEN fge_private.usuario_puede_gestionar_organizacion(d.id_organizacion)
        ELSE fge_private.usuario_puede_consultar_organizacion(d.id_organizacion)
      END
  );
$$;

REVOKE ALL ON FUNCTION fge_private.acceso_archivo_donacion(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.acceso_archivo_donacion(uuid, boolean) TO authenticated;

-- 4. Adaptar categorías de archivos para contemplar los tipos de respaldo de donación:
-- comprobante, acta_entrega, certificado, fotografia (y mantener compatibilidad con respaldo_donacion).
-- La rama id_producto sólo se incluye si la columna existe (evita errores en entornos sin el catálogo de cotizaciones).
ALTER TABLE public.archivos DROP CONSTRAINT IF EXISTS archivo_categoria_destino;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'archivos' AND column_name = 'id_producto'
  ) THEN
    ALTER TABLE public.archivos ADD CONSTRAINT archivo_categoria_destino CHECK (
      (id_organizacion IS NOT NULL AND categoria IN ('identidad_representante','imagen_organizacion','otro_organizacion')) OR
      (id_informacion_legal IS NOT NULL AND categoria IN ('identidad_representante','identificacion_legal','estatutos','otro_legal')) OR
      (id_programa IS NOT NULL AND categoria = 'imagen_programa') OR
      (id_accion IS NOT NULL AND categoria IN ('acta_pdf','foto','audio','video','otro_evidencia')) OR
      (id_donacion IS NOT NULL AND categoria IN ('comprobante','acta_entrega','certificado','fotografia','respaldo_donacion')) OR
      (id_producto IS NOT NULL AND categoria = 'ficha_tecnica')
    );
  ELSE
    ALTER TABLE public.archivos ADD CONSTRAINT archivo_categoria_destino CHECK (
      (id_organizacion IS NOT NULL AND categoria IN ('identidad_representante','imagen_organizacion','otro_organizacion')) OR
      (id_informacion_legal IS NOT NULL AND categoria IN ('identidad_representante','identificacion_legal','estatutos','otro_legal')) OR
      (id_programa IS NOT NULL AND categoria = 'imagen_programa') OR
      (id_accion IS NOT NULL AND categoria IN ('acta_pdf','foto','audio','video','otro_evidencia')) OR
      (id_donacion IS NOT NULL AND categoria IN ('comprobante','acta_entrega','certificado','fotografia','respaldo_donacion'))
    );
  END IF;
END;
$$;


-- Índice para optimizar consulta de archivos por donación
CREATE INDEX IF NOT EXISTS archivos_donacion_idx
  ON public.archivos(id_donacion)
  WHERE id_donacion IS NOT NULL AND archived_at IS NULL;

-- 5. Políticas RLS en public.archivos para respaldos de donaciones
DROP POLICY IF EXISTS archivos_donacion_lectura ON public.archivos;
CREATE POLICY archivos_donacion_lectura
ON public.archivos FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND id_donacion IS NOT NULL
  AND fge_private.acceso_archivo_donacion(id_donacion, false)
);

DROP POLICY IF EXISTS archivos_donacion_insert ON public.archivos;
CREATE POLICY archivos_donacion_insert
ON public.archivos FOR INSERT TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND id_donacion IS NOT NULL
  AND fge_private.acceso_archivo_donacion(id_donacion, true)
);

DROP POLICY IF EXISTS archivos_donacion_update ON public.archivos;
CREATE POLICY archivos_donacion_update
ON public.archivos FOR UPDATE TO authenticated
USING (
  archived_at IS NULL
  AND id_donacion IS NOT NULL
  AND fge_private.acceso_archivo_donacion(id_donacion, true)
)
WITH CHECK (
  archived_at IS NULL
  AND id_donacion IS NOT NULL
  AND fge_private.acceso_archivo_donacion(id_donacion, true)
);

-- 6. Función para verificar acceso al Storage para objetos de donación
CREATE OR REPLACE FUNCTION fge_private.acceso_objeto_donacion(p_bucket text, p_name text, p_gestion boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_donacion_id uuid;
  v_part text;
  v_estado text;
BEGIN
  IF p_bucket <> 'fge-archivos' THEN
    RETURN false;
  END IF;
  -- Patrón de ruta: donaciones/<id_donacion>/<id_archivo>.<ext>
  IF NOT (p_name LIKE 'donaciones/%') THEN
    RETURN false;
  END IF;
  v_part := split_part(p_name, '/', 2);
  IF NOT (v_part ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
    RETURN false;
  END IF;
  v_donacion_id := v_part::uuid;
  SELECT a.estado_carga INTO v_estado
  FROM public.archivos a
  WHERE a.bucket_id = p_bucket
    AND a.ruta_objeto = p_name
    AND a.id_donacion = v_donacion_id
    AND a.archived_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  RETURN CASE
    WHEN p_gestion THEN v_estado = 'reservado'
      AND fge_private.acceso_archivo_donacion(v_donacion_id, true)
    ELSE v_estado = 'disponible'
      AND fge_private.acceso_archivo_donacion(v_donacion_id, false)
  END;
END;
$$;

REVOKE ALL ON FUNCTION fge_private.acceso_objeto_donacion(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.acceso_objeto_donacion(text, text, boolean) TO authenticated;

-- Políticas de Storage para objetos de donaciones en fge-archivos
DROP POLICY IF EXISTS storage_donaciones_lectura ON storage.objects;
CREATE POLICY storage_donaciones_lectura
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fge-archivos'
  AND fge_private.acceso_objeto_donacion(bucket_id, name, false)
);

DROP POLICY IF EXISTS storage_donaciones_insert ON storage.objects;
CREATE POLICY storage_donaciones_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fge-archivos'
  AND fge_private.acceso_objeto_donacion(bucket_id, name, true)
);

DROP POLICY IF EXISTS storage_donaciones_update ON storage.objects;
CREATE POLICY storage_donaciones_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'fge-archivos'
  AND fge_private.acceso_objeto_donacion(bucket_id, name, true)
)
WITH CHECK (
  bucket_id = 'fge-archivos'
  AND fge_private.acceso_objeto_donacion(bucket_id, name, true)
);

-- 7. Funciones RPC seguras de archivado (Soft Delete)
CREATE OR REPLACE FUNCTION public.archivar_donacion_segura(p_id uuid, p_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fila public.donaciones;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501'; END IF;
  SELECT * INTO fila FROM public.donaciones WHERE id_donacion = p_id FOR UPDATE;
  IF NOT FOUND OR NOT fge_private.usuario_puede_gestionar_organizacion(fila.id_organizacion) THEN
    RAISE EXCEPTION 'Donación no disponible o sin permiso.' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR fila.version <> p_version OR fila.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'La donación cambió; recargue antes de archivar.' USING ERRCODE = '40001';
  END IF;
  -- Archivar también los archivos asociados a la donación
  UPDATE public.archivos SET archived_at = clock_timestamp() WHERE id_donacion = p_id AND archived_at IS NULL;
  UPDATE public.donaciones SET archived_at = clock_timestamp() WHERE id_donacion = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archivar_donacion_segura(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archivar_donacion_segura(uuid, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.archivar_archivo_donacion_seguro(p_id uuid, p_version bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  fila public.archivos;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501'; END IF;
  SELECT * INTO fila FROM public.archivos WHERE id_archivo = p_id FOR UPDATE;
  IF NOT FOUND OR fila.id_donacion IS NULL OR NOT fge_private.acceso_archivo_donacion(fila.id_donacion, true) THEN
    RAISE EXCEPTION 'Archivo de donación no disponible o sin permiso.' USING ERRCODE = '42501';
  END IF;
  IF p_version IS NULL OR fila.version <> p_version OR fila.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'El archivo cambió; recargue antes de archivar.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.archivos SET archived_at = clock_timestamp() WHERE id_archivo = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archivar_archivo_donacion_seguro(uuid, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archivar_archivo_donacion_seguro(uuid, bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
