BEGIN;

ALTER TABLE public.informacion_legal
  ADD CONSTRAINT informacion_legal_tipo_chk
    CHECK (tipo_personalidad_juridica IS NULL OR tipo_personalidad_juridica IN ('PJ','ONG','Fundación')),
  ADD CONSTRAINT informacion_legal_numero_registro_chk
    CHECK (numero_registro IS NULL OR (btrim(numero_registro) <> '' AND length(numero_registro) <= 150)),
  ADD CONSTRAINT informacion_legal_vigencia_chk
    CHECK (vigencia_directiva IS NULL OR (btrim(vigencia_directiva) <> '' AND length(vigencia_directiva) <= 300)),
  ADD CONSTRAINT informacion_legal_fecha_chk
    CHECK (fecha_constitucion IS NULL OR fecha_constitucion <= CURRENT_DATE);

ALTER TABLE public.archivos
  DROP CONSTRAINT archivos_bucket_id_check,
  DROP CONSTRAINT archivo_categoria_destino;
ALTER TABLE public.archivos
  ADD CONSTRAINT archivos_bucket_id_check
    CHECK (bucket_id IN ('fge-archivos','fge-expedientes-legales')),
  ADD CONSTRAINT archivo_categoria_destino CHECK (
   (id_organizacion IS NOT NULL AND categoria IN ('identidad_representante','imagen_organizacion','otro_organizacion')) OR
   (id_informacion_legal IS NOT NULL AND categoria IN ('identidad_representante','identificacion_legal','estatutos','otro_legal')) OR
   (id_programa IS NOT NULL AND categoria = 'imagen_programa') OR
   (id_accion IS NOT NULL AND categoria IN ('acta_pdf','foto','audio','video','otro_evidencia')) OR
   (id_donacion IS NOT NULL AND categoria = 'respaldo_donacion')
  ),
  ADD CONSTRAINT archivos_expediente_pdf_chk CHECK (
    id_informacion_legal IS NULL OR (
      bucket_id = 'fge-expedientes-legales'
      AND categoria IN ('identidad_representante','identificacion_legal','estatutos','otro_legal')
      AND mime_type = 'application/pdf'
      AND tamano_bytes IS NOT NULL
      AND tamano_bytes BETWEEN 1 AND 10485760
      AND lower(ruta_objeto) LIKE 'expedientes/%.pdf'
    )
  );

CREATE TABLE public.documentos_informacion_legal (
  id_documento_legal uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_informacion_legal uuid NOT NULL REFERENCES public.informacion_legal(id_informacion_legal) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK (tipo IN ('identidad_representante','identificacion_legal','estatutos')),
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','no_aplica','cargado')),
  id_archivo uuid REFERENCES public.archivos(id_archivo) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  CONSTRAINT documento_legal_archivo_estado_chk CHECK (
    (estado = 'cargado' AND id_archivo IS NOT NULL)
    OR (estado IN ('pendiente','no_aplica') AND id_archivo IS NULL)
  ),
  UNIQUE (id_informacion_legal, tipo)
);
ALTER TABLE public.documentos_informacion_legal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.documentos_informacion_legal FROM PUBLIC, anon, authenticated;

CREATE INDEX informacion_legal_organizacion_idx
  ON public.informacion_legal(id_organizacion) WHERE archived_at IS NULL;
CREATE INDEX documentos_informacion_legal_expediente_idx
  ON public.documentos_informacion_legal(id_informacion_legal) WHERE archived_at IS NULL;
CREATE INDEX documentos_informacion_legal_archivo_idx
  ON public.documentos_informacion_legal(id_archivo) WHERE id_archivo IS NOT NULL;

CREATE TRIGGER sellar BEFORE INSERT OR UPDATE ON public.documentos_informacion_legal
 FOR EACH ROW EXECUTE FUNCTION fge_private.sellar_registro();
CREATE TRIGGER auditar AFTER INSERT OR UPDATE OR DELETE ON public.documentos_informacion_legal
 FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_documento_legal');

GRANT SELECT, INSERT, UPDATE ON TABLE public.informacion_legal TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.documentos_informacion_legal TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.archivos TO authenticated;

CREATE POLICY informacion_legal_lectura
ON public.informacion_legal FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion)
);
CREATE POLICY informacion_legal_insert
ON public.informacion_legal FOR INSERT TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
);
CREATE POLICY informacion_legal_update
ON public.informacion_legal FOR UPDATE TO authenticated
USING (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
)
WITH CHECK (
  archived_at IS NULL
  AND fge_private.usuario_puede_gestionar_organizacion(id_organizacion)
);

CREATE POLICY documentos_informacion_legal_lectura
ON public.documentos_informacion_legal FOR SELECT TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.informacion_legal AS expediente
    WHERE expediente.id_informacion_legal = documentos_informacion_legal.id_informacion_legal
      AND expediente.archived_at IS NULL
      AND fge_private.usuario_puede_consultar_organizacion(expediente.id_organizacion)
  )
);
CREATE POLICY documentos_informacion_legal_insert
ON public.documentos_informacion_legal FOR INSERT TO authenticated
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.informacion_legal AS expediente
    WHERE expediente.id_informacion_legal = documentos_informacion_legal.id_informacion_legal
      AND expediente.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(expediente.id_organizacion)
  )
);
CREATE POLICY documentos_informacion_legal_update
ON public.documentos_informacion_legal FOR UPDATE TO authenticated
USING (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.informacion_legal AS expediente
    WHERE expediente.id_informacion_legal = documentos_informacion_legal.id_informacion_legal
      AND expediente.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(expediente.id_organizacion)
  )
)
WITH CHECK (
  archived_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.informacion_legal AS expediente
    WHERE expediente.id_informacion_legal = documentos_informacion_legal.id_informacion_legal
      AND expediente.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(expediente.id_organizacion)
  )
);

CREATE POLICY archivos_expediente_lectura
ON public.archivos FOR SELECT TO authenticated
USING (
  id_informacion_legal IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.informacion_legal AS expediente
    WHERE expediente.id_informacion_legal = archivos.id_informacion_legal
      AND expediente.archived_at IS NULL
      AND fge_private.usuario_puede_consultar_organizacion(expediente.id_organizacion)
  )
);
CREATE POLICY archivos_expediente_insert
ON public.archivos FOR INSERT TO authenticated
WITH CHECK (
  id_informacion_legal IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.informacion_legal AS expediente
    WHERE expediente.id_informacion_legal = archivos.id_informacion_legal
      AND expediente.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(expediente.id_organizacion)
  )
);
CREATE POLICY archivos_expediente_update
ON public.archivos FOR UPDATE TO authenticated
USING (
  id_informacion_legal IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.informacion_legal AS expediente
    WHERE expediente.id_informacion_legal = archivos.id_informacion_legal
      AND expediente.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(expediente.id_organizacion)
  )
)
WITH CHECK (
  id_informacion_legal IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.informacion_legal AS expediente
    WHERE expediente.id_informacion_legal = archivos.id_informacion_legal
      AND expediente.archived_at IS NULL
      AND fge_private.usuario_puede_gestionar_organizacion(expediente.id_organizacion)
  )
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fge-expedientes-legales', 'fge-expedientes-legales', false, 10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY storage_expediente_lectura
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fge-expedientes-legales'
  AND name LIKE 'expedientes/%'
  AND CASE
    WHEN split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN fge_private.usuario_puede_consultar_organizacion(split_part(name, '/', 2)::uuid)
    ELSE false
  END
);
CREATE POLICY storage_expediente_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'fge-expedientes-legales'
  AND name LIKE 'expedientes/%.pdf'
  AND CASE
    WHEN split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN fge_private.usuario_puede_gestionar_organizacion(split_part(name, '/', 2)::uuid)
    ELSE false
  END
);
CREATE POLICY storage_expediente_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'fge-expedientes-legales'
  AND name LIKE 'expedientes/%'
  AND CASE
    WHEN split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN fge_private.usuario_puede_gestionar_organizacion(split_part(name, '/', 2)::uuid)
    ELSE false
  END
);

CREATE OR REPLACE FUNCTION public.guardar_expediente_legal(
  p_id_organizacion uuid,
  p_datos jsonb,
  p_version_esperada bigint DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_expediente public.informacion_legal%ROWTYPE;
  v_documento jsonb;
  v_tipo text;
  v_estado text;
  v_archivo jsonb;
  v_id_archivo uuid;
BEGIN
  IF p_datos IS NULL OR jsonb_typeof(p_datos) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Debe enviar los datos del expediente.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_datos) AS clave
    WHERE clave NOT IN (
      'estado_personalidad_juridica','tipo_personalidad_juridica','numero_registro',
      'fecha_constitucion','vigencia_directiva','documentos'
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Campos de expediente no permitidos.';
  END IF;
  IF jsonb_typeof(p_datos->'documentos') <> 'array'
     OR jsonb_array_length(p_datos->'documentos') <> 3
     OR (SELECT count(DISTINCT elemento->>'tipo') FROM jsonb_array_elements(p_datos->'documentos') elemento) <> 3
     OR EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_datos->'documentos') elemento
       WHERE elemento->>'tipo' NOT IN ('identidad_representante','identificacion_legal','estatutos')
          OR elemento->>'estado' NOT IN ('pendiente','no_aplica','cargado')
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Documentos legales inválidos.';
  END IF;

  SELECT * INTO v_expediente
  FROM public.informacion_legal
  WHERE id_organizacion = p_id_organizacion AND archived_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_version_esperada IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'El expediente legal no existe.';
    END IF;
    INSERT INTO public.informacion_legal (
      id_organizacion, estado_personalidad_juridica, tipo_personalidad_juridica,
      numero_registro, fecha_constitucion, vigencia_directiva
    ) VALUES (
      p_id_organizacion,
      p_datos->>'estado_personalidad_juridica',
      NULLIF(btrim(p_datos->>'tipo_personalidad_juridica'), ''),
      NULLIF(btrim(p_datos->>'numero_registro'), ''),
      NULLIF(p_datos->>'fecha_constitucion', '')::date,
      NULLIF(btrim(p_datos->>'vigencia_directiva'), '')
    ) RETURNING * INTO v_expediente;
  ELSE
    IF p_version_esperada IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'La Organización ya posee expediente legal.';
    END IF;
    IF v_expediente.version <> p_version_esperada THEN
      RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'El expediente fue modificado por otra sesión.';
    END IF;
    UPDATE public.informacion_legal SET
      estado_personalidad_juridica = p_datos->>'estado_personalidad_juridica',
      tipo_personalidad_juridica = NULLIF(btrim(p_datos->>'tipo_personalidad_juridica'), ''),
      numero_registro = NULLIF(btrim(p_datos->>'numero_registro'), ''),
      fecha_constitucion = NULLIF(p_datos->>'fecha_constitucion', '')::date,
      vigencia_directiva = NULLIF(btrim(p_datos->>'vigencia_directiva'), '')
    WHERE id_informacion_legal = v_expediente.id_informacion_legal
    RETURNING * INTO v_expediente;
  END IF;

  FOR v_documento IN SELECT value FROM jsonb_array_elements(p_datos->'documentos') LOOP
    v_tipo := v_documento->>'tipo';
    v_estado := v_documento->>'estado';
    v_archivo := v_documento->'archivo';
    v_id_archivo := NULL;

    IF v_archivo IS NOT NULL AND jsonb_typeof(v_archivo) = 'object' THEN
      IF v_estado <> 'cargado'
         OR v_archivo->>'mime_type' <> 'application/pdf'
         OR COALESCE((v_archivo->>'tamano_bytes')::bigint, 0) NOT BETWEEN 1 AND 10485760
         OR NULLIF(btrim(v_archivo->>'nombre_original'), '') IS NULL
         OR NULLIF(btrim(v_archivo->>'ruta_objeto'), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Metadatos de PDF inválidos.';
      END IF;
      UPDATE public.archivos SET archived_at = clock_timestamp()
      WHERE id_archivo = (
        SELECT id_archivo FROM public.documentos_informacion_legal
        WHERE id_informacion_legal = v_expediente.id_informacion_legal AND tipo = v_tipo
      ) AND archived_at IS NULL;
      INSERT INTO public.archivos (
        id_informacion_legal, bucket_id, ruta_objeto, nombre_original, mime_type,
        tamano_bytes, categoria, estado_carga
      ) VALUES (
        v_expediente.id_informacion_legal, 'fge-expedientes-legales', v_archivo->>'ruta_objeto',
        v_archivo->>'nombre_original', 'application/pdf',
        (v_archivo->>'tamano_bytes')::bigint, v_tipo, 'disponible'
      ) RETURNING id_archivo INTO v_id_archivo;
    ELSIF v_estado = 'cargado' THEN
      SELECT id_archivo INTO v_id_archivo
      FROM public.documentos_informacion_legal
      WHERE id_informacion_legal = v_expediente.id_informacion_legal
        AND tipo = v_tipo AND estado = 'cargado' AND archived_at IS NULL;
      IF v_id_archivo IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Un documento cargado requiere un PDF.';
      END IF;
    ELSE
      UPDATE public.archivos SET archived_at = clock_timestamp()
      WHERE id_archivo = (
        SELECT id_archivo FROM public.documentos_informacion_legal
        WHERE id_informacion_legal = v_expediente.id_informacion_legal AND tipo = v_tipo
      ) AND archived_at IS NULL;
    END IF;

    INSERT INTO public.documentos_informacion_legal (
      id_informacion_legal, tipo, estado, id_archivo
    ) VALUES (v_expediente.id_informacion_legal, v_tipo, v_estado, v_id_archivo)
    ON CONFLICT (id_informacion_legal, tipo) DO UPDATE SET
      estado = EXCLUDED.estado,
      id_archivo = EXCLUDED.id_archivo,
      archived_at = NULL;
  END LOOP;

  RETURN v_expediente.id_informacion_legal;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_expediente_legal(uuid,jsonb,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_expediente_legal(uuid,jsonb,bigint) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
