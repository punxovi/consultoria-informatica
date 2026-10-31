BEGIN;

CREATE TABLE public.adjuntos_acta (
  id_adjunto uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  id_acta uuid NOT NULL
    REFERENCES public.actas(id_acta) ON DELETE RESTRICT,

  bucket_id text NOT NULL DEFAULT 'fge-evidencias'
    CHECK (bucket_id = 'fge-evidencias'),

  ruta_objeto text NOT NULL UNIQUE,

  nombre_original text NOT NULL
    CHECK (length(btrim(nombre_original)) BETWEEN 1 AND 255),

  mime_type text NOT NULL
    CHECK (mime_type IN (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'video/mp4',
      'video/webm'
    )),

  tamano_bytes bigint NOT NULL
    CHECK (tamano_bytes BETWEEN 1 AND 52428800),

  estado_carga text NOT NULL DEFAULT 'reservado'
    CHECK (estado_carga IN ('reservado', 'disponible', 'fallido')),

  version bigint NOT NULL DEFAULT 1
    CHECK (version >= 1),

  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_at timestamptz,

  CONSTRAINT adjuntos_acta_ruta_correcta
    CHECK (
      ruta_objeto =
        'actas/' || id_acta::text || '/' || id_adjunto::text
    )
);

CREATE INDEX adjuntos_acta_id_acta_idx
  ON public.adjuntos_acta(id_acta)
  WHERE archived_at IS NULL;

-- Validación de modificaciones y actualización de fecha.
CREATE OR REPLACE FUNCTION fge_private.validar_actualizacion_adjunto_acta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.id_adjunto IS DISTINCT FROM OLD.id_adjunto
    OR NEW.id_acta IS DISTINCT FROM OLD.id_acta
    OR NEW.bucket_id IS DISTINCT FROM OLD.bucket_id
    OR NEW.ruta_objeto IS DISTINCT FROM OLD.ruta_objeto
    OR NEW.nombre_original IS DISTINCT FROM OLD.nombre_original
    OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
    OR NEW.tamano_bytes IS DISTINCT FROM OLD.tamano_bytes
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'No se pueden modificar los datos originales del adjunto.';
  END IF;

  IF OLD.estado_carga NOT IN ('reservado', 'fallido')
    OR NEW.estado_carga <> 'disponible'
    OR NEW.version <> OLD.version + 1
    OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
  THEN
    RAISE EXCEPTION 'Transición de estado o versión no permitida.';
  END IF;

  NEW.updated_at := clock_timestamp();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION
  fge_private.validar_actualizacion_adjunto_acta()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER adjuntos_acta_validar_update
BEFORE UPDATE ON public.adjuntos_acta
FOR EACH ROW
EXECUTE FUNCTION fge_private.validar_actualizacion_adjunto_acta();

ALTER TABLE public.adjuntos_acta ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.adjuntos_acta
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT
  ON public.adjuntos_acta
  TO authenticated;

GRANT UPDATE (estado_carga, version)
  ON public.adjuntos_acta
  TO authenticated;

CREATE POLICY adjuntos_acta_lectura
ON public.adjuntos_acta
FOR SELECT
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.actas a
    WHERE a.id_acta = adjuntos_acta.id_acta
      AND a.archived_at IS NULL
      AND (
        (
          adjuntos_acta.estado_carga = 'disponible'
          AND fge_private.usuario_puede_consultar_organizacion(
            a.id_organizacion
          )
        )
        OR fge_private.usuario_puede_gestionar_organizacion(
          a.id_organizacion
        )
      )
  )
);

CREATE POLICY adjuntos_acta_insert
ON public.adjuntos_acta
FOR INSERT
TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND estado_carga = 'reservado'
  AND version = 1
  AND EXISTS (
    SELECT 1
    FROM public.actas a
    WHERE a.id_acta = adjuntos_acta.id_acta
      AND a.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(
        a.id_organizacion
      )
  )
);

CREATE POLICY adjuntos_acta_update
ON public.adjuntos_acta
FOR UPDATE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.actas a
    WHERE a.id_acta = adjuntos_acta.id_acta
      AND a.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(
        a.id_organizacion
      )
  )
)
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.actas a
    WHERE a.id_acta = adjuntos_acta.id_acta
      AND a.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(
        a.id_organizacion
      )
  )
);

-- Acceso independiente para objetos asociados a actas.
CREATE OR REPLACE FUNCTION fge_private.acceso_objeto_adjunto_acta(
  p_bucket text,
  p_ruta text,
  p_carga boolean
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.adjuntos_acta aa
    JOIN public.actas a
      ON a.id_acta = aa.id_acta
    WHERE aa.bucket_id = p_bucket
      AND aa.ruta_objeto = p_ruta
      AND aa.archived_at IS NULL
      AND a.archived_at IS NULL
      AND CASE
        WHEN p_carga THEN
          aa.estado_carga IN ('reservado', 'fallido')
          AND fge_private.usuario_puede_gestionar_organizacion(
            a.id_organizacion
          )
        ELSE
          (
            aa.estado_carga = 'disponible'
            AND fge_private.usuario_puede_consultar_organizacion(
              a.id_organizacion
            )
          )
          OR fge_private.usuario_puede_gestionar_organizacion(
            a.id_organizacion
          )
      END
  );
$$;

REVOKE ALL ON FUNCTION
  fge_private.acceso_objeto_adjunto_acta(text, text, boolean)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  fge_private.acceso_objeto_adjunto_acta(text, text, boolean)
  TO authenticated;

CREATE POLICY storage_adjuntos_acta_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'fge-evidencias'
  AND fge_private.acceso_objeto_adjunto_acta(
    bucket_id,
    name,
    true
  )
);

CREATE POLICY storage_adjuntos_acta_select
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'fge-evidencias'
  AND fge_private.acceso_objeto_adjunto_acta(
    bucket_id,
    name,
    false
  )
);

COMMENT ON TABLE public.adjuntos_acta IS
  'Metadatos de archivos adjuntos a actas de reunión.';

COMMENT ON COLUMN public.adjuntos_acta.ruta_objeto IS
  'Ruta actas/id_acta/id_adjunto dentro del bucket privado fge-evidencias.';

COMMENT ON COLUMN public.adjuntos_acta.estado_carga IS
  'Reservado: pendiente de carga. Disponible: archivo cargado. Fallido: carga fallida y reintentable.';

GRANT DELETE ON TABLE public.adjuntos_acta TO authenticated;

CREATE POLICY adjuntos_acta_delete
ON public.adjuntos_acta
FOR DELETE
TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.actas a
    WHERE a.id_acta = adjuntos_acta.id_acta
      AND a.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(
        a.id_organizacion
      )
  )
);

CREATE OR REPLACE FUNCTION fge_private.usuario_puede_eliminar_objeto_adjunto_acta(
  p_bucket text,
  p_ruta text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.adjuntos_acta aa
    JOIN public.actas a
      ON a.id_acta = aa.id_acta
    WHERE aa.bucket_id = p_bucket
      AND aa.ruta_objeto = p_ruta
      AND aa.archived_at IS NULL
      AND a.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(
        a.id_organizacion
      )
  );
$$;

REVOKE ALL ON FUNCTION
  fge_private.usuario_puede_eliminar_objeto_adjunto_acta(text, text)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  fge_private.usuario_puede_eliminar_objeto_adjunto_acta(text, text)
  TO authenticated;

CREATE POLICY storage_adjuntos_acta_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'fge-evidencias'
  AND fge_private.usuario_puede_eliminar_objeto_adjunto_acta(
    bucket_id,
    name
  )
);

NOTIFY pgrst, 'reload schema';

COMMIT;
