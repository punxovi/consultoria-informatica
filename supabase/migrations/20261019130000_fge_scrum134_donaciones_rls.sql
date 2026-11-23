BEGIN;

CREATE OR REPLACE FUNCTION fge_private.usuario_puede_consultar_donacion(
  p_id_organizacion uuid
) RETURNS boolean
LANGUAGE sql
STABLE
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
     AND rol.codigo IN ('ADMIN', 'COORD', 'INVIT')
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
            OR (
              rol.codigo = 'COORD'
              AND fge_private.usuario_tiene_cobertura_pais(organizacion.id_pais)
            )
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION fge_private.usuario_puede_consultar_donacion(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.usuario_puede_consultar_donacion(uuid)
  TO authenticated;

DROP POLICY IF EXISTS donaciones_lectura ON public.donaciones;
CREATE POLICY donaciones_lectura
ON public.donaciones FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_puede_consultar_donacion(id_organizacion)
);

CREATE OR REPLACE FUNCTION fge_private.acceso_archivo_donacion(
  p_donacion uuid,
  p_gestion boolean
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.donaciones AS donacion
    WHERE donacion.id_donacion = p_donacion
      AND donacion.archived_at IS NULL
      AND CASE
        WHEN p_gestion THEN fge_private.usuario_puede_gestionar_organizacion(donacion.id_organizacion)
        ELSE fge_private.usuario_puede_consultar_donacion(donacion.id_organizacion)
      END
  );
$$;

REVOKE ALL ON FUNCTION fge_private.acceso_archivo_donacion(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.acceso_archivo_donacion(uuid, boolean)
  TO authenticated;

CREATE OR REPLACE FUNCTION fge_private.validar_archivo_donacion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.id_donacion IS NOT NULL THEN
    IF TG_OP = 'UPDATE' AND OLD.id_donacion IS DISTINCT FROM NEW.id_donacion THEN
      RAISE EXCEPTION 'El respaldo no puede cambiar de Donación.' USING ERRCODE = '42501';
    END IF;

    IF NEW.bucket_id <> 'fge-archivos'
       OR NEW.ruta_objeto !~ ('^donaciones/' || NEW.id_donacion::text || '/[^/]+$') THEN
      RAISE EXCEPTION 'La ruta del respaldo no corresponde a su Donación.' USING ERRCODE = '23514';
    END IF;

    IF NEW.categoria NOT IN ('comprobante', 'acta_entrega', 'certificado', 'fotografia', 'respaldo_donacion') THEN
      RAISE EXCEPTION 'La categoría del respaldo no es válida.' USING ERRCODE = '23514';
    END IF;

    IF NEW.tipo_respaldo IS NOT NULL AND NEW.tipo_respaldo <> NEW.categoria THEN
      RAISE EXCEPTION 'El tipo y la categoría del respaldo deben coincidir.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION fge_private.validar_archivo_donacion() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validar_archivo_donacion ON public.archivos;
CREATE TRIGGER validar_archivo_donacion
  BEFORE INSERT OR UPDATE ON public.archivos
  FOR EACH ROW EXECUTE FUNCTION fge_private.validar_archivo_donacion();

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

NOTIFY pgrst, 'reload schema';
COMMIT;
