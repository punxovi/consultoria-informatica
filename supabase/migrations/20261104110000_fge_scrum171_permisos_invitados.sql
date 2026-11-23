BEGIN;

CREATE OR REPLACE FUNCTION fge_private.usuario_es_invitado()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.asignaciones_roles a
    JOIN public.roles r ON r.id_rol = a.id_rol
    JOIN public.perfiles p ON p.id_usuario = a.id_usuario
    WHERE a.id_usuario = auth.uid()
      AND a.revocado_at IS NULL AND a.archived_at IS NULL
      AND p.activo AND p.archived_at IS NULL
      AND r.codigo = 'INVIT' AND r.activo AND r.archived_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.asignaciones_roles ai
        JOIN public.roles ri ON ri.id_rol = ai.id_rol
        WHERE ai.id_usuario = auth.uid()
          AND ai.revocado_at IS NULL AND ai.archived_at IS NULL
          AND ri.codigo IN ('ADMIN', 'COORD') AND ri.activo AND ri.archived_at IS NULL
      )
  );
$$;
REVOKE ALL ON FUNCTION fge_private.usuario_es_invitado() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.usuario_es_invitado() TO authenticated;

DROP POLICY IF EXISTS organizaciones_invitado_sin_acceso_directo ON public.organizaciones;
CREATE POLICY organizaciones_invitado_sin_acceso_directo
ON public.organizaciones AS RESTRICTIVE FOR SELECT TO authenticated
USING (NOT fge_private.usuario_es_invitado());

CREATE OR REPLACE VIEW public.organizaciones_invitado
WITH (security_barrier = true) AS
SELECT o.id_organizacion, o.id_pais, o.nombre,
       o.region_departamento, o.comuna_municipio_ciudad,
       o.publico_objetivo, o.descripcion_breve, o.tipo_organizacion,
       o.numero_beneficiarios,
       jsonb_build_object('id_pais', p.id_pais, 'codigo_iso', p.codigo_iso, 'nombre', p.nombre) AS pais,
       o.archived_at, o.version
FROM public.organizaciones o
JOIN public.paises p ON p.id_pais = o.id_pais
WHERE o.archived_at IS NULL AND p.archived_at IS NULL
  AND fge_private.usuario_puede_consultar_organizacion(o.id_organizacion);
REVOKE ALL ON public.organizaciones_invitado FROM PUBLIC, anon;
GRANT SELECT ON public.organizaciones_invitado TO authenticated;

DROP POLICY IF EXISTS evidencias_lectura ON public.evidencias;
CREATE POLICY evidencias_lectura ON public.evidencias FOR SELECT TO authenticated
USING (archived_at IS NULL AND NOT fge_private.usuario_es_invitado()
  AND fge_private.acceso_evidencia_accion(id_accion, false));

DROP POLICY IF EXISTS storage_evidencias_select ON storage.objects;
CREATE POLICY storage_evidencias_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fge-evidencias' AND NOT fge_private.usuario_es_invitado()
  AND fge_private.acceso_objeto_evidencia(bucket_id, name, false));

DROP POLICY IF EXISTS adjuntos_acta_lectura ON public.adjuntos_acta;
CREATE POLICY adjuntos_acta_lectura ON public.adjuntos_acta FOR SELECT TO authenticated
USING (archived_at IS NULL AND NOT fge_private.usuario_es_invitado() AND EXISTS (
  SELECT 1 FROM public.actas a
  WHERE a.id_acta = adjuntos_acta.id_acta AND a.archived_at IS NULL
    AND fge_private.usuario_puede_consultar_organizacion(a.id_organizacion)
));

DROP POLICY IF EXISTS storage_adjuntos_acta_select ON storage.objects;
CREATE POLICY storage_adjuntos_acta_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fge-evidencias' AND NOT fge_private.usuario_es_invitado()
  AND fge_private.acceso_objeto_adjunto_acta(bucket_id, name, false));

DROP POLICY IF EXISTS informacion_legal_lectura ON public.informacion_legal;
CREATE POLICY informacion_legal_lectura ON public.informacion_legal FOR SELECT TO authenticated
USING (archived_at IS NULL AND NOT fge_private.usuario_es_invitado()
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion));
DROP POLICY IF EXISTS documentos_informacion_legal_lectura ON public.documentos_informacion_legal;
CREATE POLICY documentos_informacion_legal_lectura ON public.documentos_informacion_legal FOR SELECT TO authenticated
USING (archived_at IS NULL AND NOT fge_private.usuario_es_invitado() AND EXISTS (
  SELECT 1 FROM public.informacion_legal e
  WHERE e.id_informacion_legal = documentos_informacion_legal.id_informacion_legal
    AND e.archived_at IS NULL AND fge_private.usuario_puede_consultar_organizacion(e.id_organizacion)
));
DROP POLICY IF EXISTS archivos_expediente_lectura ON public.archivos;
CREATE POLICY archivos_expediente_lectura ON public.archivos FOR SELECT TO authenticated
USING (id_informacion_legal IS NOT NULL AND NOT fge_private.usuario_es_invitado() AND EXISTS (
  SELECT 1 FROM public.informacion_legal e
  WHERE e.id_informacion_legal = archivos.id_informacion_legal
    AND e.archived_at IS NULL AND fge_private.usuario_puede_consultar_organizacion(e.id_organizacion)
));
DROP POLICY IF EXISTS storage_expediente_lectura ON storage.objects;
CREATE POLICY storage_expediente_lectura ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'fge-expedientes-legales'
  AND NOT fge_private.usuario_es_invitado()
  AND name LIKE 'expedientes/%'
  AND CASE
    WHEN split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN fge_private.usuario_puede_consultar_organizacion(split_part(name, '/', 2)::uuid)
    ELSE false
  END
);

DROP POLICY IF EXISTS actas_lectura ON public.actas;
CREATE POLICY actas_lectura ON public.actas FOR SELECT TO authenticated
USING (archived_at IS NULL AND NOT fge_private.usuario_es_invitado()
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion));
DROP POLICY IF EXISTS compromisos_lectura ON public.compromisos;
CREATE POLICY compromisos_lectura ON public.compromisos FOR SELECT TO authenticated
USING (archived_at IS NULL AND NOT fge_private.usuario_es_invitado() AND EXISTS (
  SELECT 1 FROM public.actas a WHERE a.id_acta = compromisos.id_acta
    AND a.archived_at IS NULL AND fge_private.usuario_puede_consultar_organizacion(a.id_organizacion)
));
DROP POLICY IF EXISTS diagnosticos_lectura ON public.diagnosticos;
CREATE POLICY diagnosticos_lectura ON public.diagnosticos FOR SELECT TO authenticated
USING (archived_at IS NULL AND NOT fge_private.usuario_es_invitado()
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion));

DROP POLICY IF EXISTS donaciones_lectura ON public.donaciones;
CREATE POLICY donaciones_lectura ON public.donaciones FOR SELECT TO authenticated
USING (archived_at IS NULL AND NOT fge_private.usuario_es_invitado()
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion));
DROP POLICY IF EXISTS archivos_donacion_lectura ON public.archivos;
CREATE POLICY archivos_donacion_lectura ON public.archivos FOR SELECT TO authenticated
USING (archived_at IS NULL AND NOT fge_private.usuario_es_invitado()
  AND id_donacion IS NOT NULL AND fge_private.acceso_archivo_donacion(id_donacion, false));
DROP POLICY IF EXISTS storage_donaciones_lectura ON storage.objects;
CREATE POLICY storage_donaciones_lectura ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fge-archivos' AND NOT fge_private.usuario_es_invitado()
  AND fge_private.acceso_objeto_donacion(bucket_id, name, false));

DROP POLICY IF EXISTS archivos_imagen_organizacion_lectura ON public.archivos;
CREATE POLICY archivos_imagen_organizacion_lectura ON public.archivos FOR SELECT TO authenticated
USING (id_organizacion IS NOT NULL AND categoria = 'imagen_organizacion'
  AND NOT fge_private.usuario_es_invitado()
  AND fge_private.usuario_puede_consultar_organizacion(id_organizacion));

DROP POLICY IF EXISTS storage_imagen_organizacion_lectura ON storage.objects;
CREATE POLICY storage_imagen_organizacion_lectura ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fge-archivos' AND NOT fge_private.usuario_es_invitado()
  AND name LIKE 'organizaciones/%/imagen/%'
  AND CASE
    WHEN split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN fge_private.usuario_puede_consultar_organizacion(split_part(name, '/', 2)::uuid)
    ELSE false
  END);

NOTIFY pgrst, 'reload schema';
COMMIT;
