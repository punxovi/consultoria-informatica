BEGIN;

CREATE OR REPLACE FUNCTION fge_private.detalle_solicitud_cotizacion(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT jsonb_build_object('id_solicitud',s.id_solicitud,'nombre',s.nombre,'apellido',s.apellido,'nombre_solicitante',s.nombre_solicitante,
  'correo',s.correo,'telefono',s.telefono,'mensaje',s.mensaje,'id_envio',s.id_envio,'id_pais',s.id_pais,'id_coordinador',s.id_coordinador,
  'sin_coordinador_al_recibir',s.sin_coordinador_al_recibir,'solo_informativa',NOT fge_private.acceso_solicitud_cotizacion(s.id_solicitud,true),
  'estado',s.estado,'created_at',s.created_at,'updated_at',s.updated_at,'version',s.version,
  'estados_permitidos',CASE WHEN fge_private.acceso_solicitud_cotizacion(s.id_solicitud,true) THEN
    coalesce((SELECT jsonb_agg(e) FROM unnest(ARRAY['en_gestion','cotizada','cerrada','rechazada']) e WHERE e<>s.estado),'[]'::jsonb) ELSE '[]'::jsonb END,
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id_producto',d.id_producto,'nombre',d.nombre_producto,'nombre_producto',d.nombre_producto,
    'unidad_medida',d.unidad_medida,'cantidad',d.cantidad,'organizacion',jsonb_build_object('id_organizacion',d.id_organizacion,'nombre',d.nombre_organizacion,
      'pais',jsonb_build_object('id_pais',d.id_pais,'nombre',d.nombre_pais))) ORDER BY d.id_detalle)
    FROM public.solicitud_cotizacion_detalles d WHERE d.id_solicitud=s.id_solicitud AND d.archived_at IS NULL),'[]'::jsonb))
FROM public.solicitudes_cotizacion s WHERE s.id_solicitud=p_id;
$$;

CREATE OR REPLACE FUNCTION fge_private.impedir_volver_a_solicitada() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NEW.estado = 'solicitada' AND OLD.estado IS DISTINCT FROM 'solicitada' THEN
    RAISE EXCEPTION 'Una solicitud no puede volver al estado Nueva' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fge_private.impedir_volver_a_solicitada() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS impedir_volver_a_solicitada ON public.solicitudes_cotizacion;
CREATE TRIGGER impedir_volver_a_solicitada BEFORE UPDATE OF estado ON public.solicitudes_cotizacion
FOR EACH ROW EXECUTE FUNCTION fge_private.impedir_volver_a_solicitada();

NOTIFY pgrst, 'reload schema';
COMMIT;
