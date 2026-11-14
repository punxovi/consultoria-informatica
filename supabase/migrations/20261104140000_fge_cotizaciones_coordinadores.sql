-- Bandeja privada por territorio y cambios de estado con control de versión.
BEGIN;

CREATE OR REPLACE FUNCTION public.consultar_solicitudes_cotizacion()
RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.get_user_roles() r WHERE r.codigo IN ('ADMIN', 'COORD')
  ) THEN
    RAISE EXCEPTION 'Se requiere rol de Coordinador o Administrador' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'id_solicitud', s.id_solicitud, 'nombre_solicitante', s.nombre_solicitante,
    'correo', s.correo, 'telefono', s.telefono, 'mensaje', s.mensaje,
    'estado', s.estado, 'created_at', s.created_at, 'updated_at', s.updated_at, 'version', s.version,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id_producto', p.id_producto, 'nombre', d.nombre_producto,
        'unidad_medida', d.unidad_medida, 'cantidad', d.cantidad,
        'organizacion', jsonb_build_object('id_organizacion', o.id_organizacion, 'nombre', o.nombre,
          'pais', jsonb_build_object('id_pais', pais.id_pais, 'nombre', pais.nombre))
      ) ORDER BY p.nombre)
      FROM public.solicitud_cotizacion_detalles d
      JOIN public.productos p ON p.id_producto = d.id_producto
      JOIN public.organizaciones o ON o.id_organizacion = p.id_organizacion
      JOIN public.paises pais ON pais.id_pais = o.id_pais
      WHERE d.id_solicitud = s.id_solicitud AND d.archived_at IS NULL
    ), '[]'::jsonb)
  )
  FROM public.solicitudes_cotizacion s
  WHERE s.archived_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.solicitud_cotizacion_detalles d
      JOIN public.productos p ON p.id_producto = d.id_producto
      WHERE d.id_solicitud = s.id_solicitud AND d.archived_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.solicitud_cotizacion_detalles d
      JOIN public.productos p ON p.id_producto = d.id_producto
      WHERE d.id_solicitud = s.id_solicitud AND d.archived_at IS NULL
        AND NOT fge_private.usuario_puede_gestionar_organizacion(p.id_organizacion)
    )
  ORDER BY s.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.actualizar_estado_solicitud_cotizacion(
  p_id_solicitud uuid, p_version_esperada bigint, p_estado text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_fila public.solicitudes_cotizacion;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_user_roles() r WHERE r.codigo IN ('ADMIN', 'COORD')) THEN
    RAISE EXCEPTION 'Se requiere rol de Coordinador o Administrador' USING ERRCODE = '42501';
  END IF;
  IF p_estado NOT IN ('solicitada', 'en_gestion', 'cotizada', 'cerrada', 'rechazada') THEN
    RAISE EXCEPTION 'Estado de solicitud inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.solicitudes_cotizacion s
    WHERE s.id_solicitud = p_id_solicitud AND s.archived_at IS NULL
      AND EXISTS (SELECT 1 FROM public.solicitud_cotizacion_detalles d WHERE d.id_solicitud = s.id_solicitud AND d.archived_at IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM public.solicitud_cotizacion_detalles d
        JOIN public.productos p ON p.id_producto = d.id_producto
        WHERE d.id_solicitud = s.id_solicitud AND d.archived_at IS NULL
          AND NOT fge_private.usuario_puede_gestionar_organizacion(p.id_organizacion)
      )
  ) THEN
    RAISE EXCEPTION 'La solicitud está fuera de la cobertura asignada' USING ERRCODE = '42501';
  END IF;
  UPDATE public.solicitudes_cotizacion
    SET estado = p_estado
    WHERE id_solicitud = p_id_solicitud AND archived_at IS NULL AND version = p_version_esperada
    RETURNING * INTO v_fila;
  IF NOT FOUND THEN RAISE EXCEPTION 'La solicitud cambió o ya no existe' USING ERRCODE = 'P0001'; END IF;
  RETURN jsonb_build_object('id_solicitud', v_fila.id_solicitud, 'estado', v_fila.estado,
    'version', v_fila.version, 'updated_at', v_fila.updated_at);
END;
$$;

REVOKE ALL ON FUNCTION public.consultar_solicitudes_cotizacion() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.actualizar_estado_solicitud_cotizacion(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consultar_solicitudes_cotizacion() TO authenticated;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_solicitud_cotizacion(uuid, bigint, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
