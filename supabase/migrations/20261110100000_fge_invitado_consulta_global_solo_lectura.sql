-- Permisos del Invitado: consulta global de todo el contenido de negocio,
-- sin ninguna operación de modificación.
-- Las tablas de seguridad, administración y auditoría permanecen fuera de
-- este alcance.
BEGIN;

CREATE OR REPLACE FUNCTION fge_private.usuario_puede_consultar_organizacion(
  p_id_organizacion uuid
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organizaciones o
    CROSS JOIN public.get_user_roles() r
    WHERE o.id_organizacion = p_id_organizacion
      AND o.archived_at IS NULL
      AND (r.codigo IN ('ADMIN', 'COORD') OR r.codigo = 'INVIT')
  );
$$;

REVOKE ALL ON FUNCTION fge_private.usuario_puede_consultar_organizacion(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fge_private.usuario_puede_consultar_organizacion(uuid)
  TO authenticated;

DO $$
DECLARE
  nombre_tabla text;
  filtro_lectura text;
  tablas_contenido constant text[] := ARRAY[
    'paises', 'organizaciones', 'organizacion_redes', 'contactos',
    'informacion_legal', 'documentos_informacion_legal', 'diagnosticos',
    'programas', 'programa_lineas_accion', 'planes', 'acciones',
    'actas', 'acta_participantes', 'compromisos', 'indicadores',
    'resultados', 'donaciones', 'archivos', 'evidencias', 'adjuntos_acta',
    'productos', 'solicitudes_cotizacion', 'solicitud_cotizacion_detalles',
    'solicitud_cotizacion_destinatarios', 'evidencias_solicitud_cotizacion'
  ];
BEGIN
  FOREACH nombre_tabla IN ARRAY tablas_contenido LOOP
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', nombre_tabla);
    filtro_lectura := CASE
      WHEN nombre_tabla IN ('solicitud_cotizacion_destinatarios', 'evidencias_solicitud_cotizacion')
        THEN 'fge_private.usuario_es_invitado()'
      ELSE 'fge_private.usuario_es_invitado() AND archived_at IS NULL'
    END;
    EXECUTE format('DROP POLICY IF EXISTS invitado_consulta_global ON public.%I', nombre_tabla);
    EXECUTE format(
      'CREATE POLICY invitado_consulta_global ON public.%I AS PERMISSIVE FOR SELECT TO authenticated USING (%s)',
      nombre_tabla, filtro_lectura
    );
    -- Un veto RESTRICTIVE FOR ALL también bloquearía el SELECT del Invitado.
    -- Se separa por operación para mantener lectura global y bloquear escrituras.
    EXECUTE format('DROP POLICY IF EXISTS invitado_solo_lectura ON public.%I', nombre_tabla);
    EXECUTE format('DROP POLICY IF EXISTS invitado_solo_insertar ON public.%I', nombre_tabla);
    EXECUTE format('DROP POLICY IF EXISTS invitado_solo_actualizar ON public.%I', nombre_tabla);
    EXECUTE format('DROP POLICY IF EXISTS invitado_solo_eliminar ON public.%I', nombre_tabla);
    EXECUTE format(
      'CREATE POLICY invitado_solo_insertar ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT fge_private.usuario_es_invitado())',
      nombre_tabla
    );
    EXECUTE format(
      'CREATE POLICY invitado_solo_actualizar ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT fge_private.usuario_es_invitado()) WITH CHECK (NOT fge_private.usuario_es_invitado())',
      nombre_tabla
    );
    EXECUTE format(
      'CREATE POLICY invitado_solo_eliminar ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT fge_private.usuario_es_invitado())',
      nombre_tabla
    );
  END LOOP;
END $$;

-- Esta política histórica impedía leer organizaciones directamente aunque la
-- nueva política global ya autorice su consulta.
DROP POLICY IF EXISTS organizaciones_invitado_sin_acceso_directo ON public.organizaciones;

GRANT SELECT ON public.organizaciones_invitado TO authenticated;

GRANT SELECT ON storage.objects TO authenticated;
DROP POLICY IF EXISTS invitado_consulta_global ON storage.objects;
CREATE POLICY invitado_consulta_global
ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
USING (
  fge_private.usuario_es_invitado()
  AND bucket_id IN ('fge-archivos', 'fge-evidencias', 'fge-expedientes-legales', 'fge-cotizaciones')
);

DROP POLICY IF EXISTS invitado_solo_lectura ON storage.objects;
DROP POLICY IF EXISTS invitado_solo_insertar ON storage.objects;
DROP POLICY IF EXISTS invitado_solo_actualizar ON storage.objects;
DROP POLICY IF EXISTS invitado_solo_eliminar ON storage.objects;
CREATE POLICY invitado_solo_insertar
ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (NOT fge_private.usuario_es_invitado());
CREATE POLICY invitado_solo_actualizar
ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated
USING (NOT fge_private.usuario_es_invitado())
WITH CHECK (NOT fge_private.usuario_es_invitado());
CREATE POLICY invitado_solo_eliminar
ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated
USING (NOT fge_private.usuario_es_invitado());

NOTIFY pgrst, 'reload schema';
COMMIT;
