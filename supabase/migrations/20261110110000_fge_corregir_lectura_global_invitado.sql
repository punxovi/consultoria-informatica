BEGIN;

DROP POLICY IF EXISTS invitado_solo_lectura ON public.organizaciones;
DROP POLICY IF EXISTS organizaciones_invitado_sin_acceso_directo ON public.organizaciones;

DO $$
DECLARE
  nombre_tabla text;
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
    EXECUTE format('DROP POLICY IF EXISTS invitado_solo_lectura ON public.%I', nombre_tabla);
    EXECUTE format('DROP POLICY IF EXISTS invitado_solo_insertar ON public.%I', nombre_tabla);
    EXECUTE format('DROP POLICY IF EXISTS invitado_solo_actualizar ON public.%I', nombre_tabla);
    EXECUTE format('DROP POLICY IF EXISTS invitado_solo_eliminar ON public.%I', nombre_tabla);
    EXECUTE format('CREATE POLICY invitado_solo_insertar ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT fge_private.usuario_es_invitado())', nombre_tabla);
    EXECUTE format('CREATE POLICY invitado_solo_actualizar ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT fge_private.usuario_es_invitado()) WITH CHECK (NOT fge_private.usuario_es_invitado())', nombre_tabla);
    EXECUTE format('CREATE POLICY invitado_solo_eliminar ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT fge_private.usuario_es_invitado())', nombre_tabla);
  END LOOP;
END $$;

DROP POLICY IF EXISTS invitado_solo_lectura ON storage.objects;
DROP POLICY IF EXISTS invitado_solo_insertar ON storage.objects;
DROP POLICY IF EXISTS invitado_solo_actualizar ON storage.objects;
DROP POLICY IF EXISTS invitado_solo_eliminar ON storage.objects;
CREATE POLICY invitado_solo_insertar ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT fge_private.usuario_es_invitado());
CREATE POLICY invitado_solo_actualizar ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT fge_private.usuario_es_invitado()) WITH CHECK (NOT fge_private.usuario_es_invitado());
CREATE POLICY invitado_solo_eliminar ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT fge_private.usuario_es_invitado());

NOTIFY pgrst, 'reload schema';
COMMIT;
