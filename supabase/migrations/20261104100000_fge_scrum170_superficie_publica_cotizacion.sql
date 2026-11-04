-- SCRUM-170: superficie pública mínima para catálogo y solicitudes.
BEGIN;

CREATE OR REPLACE VIEW public.catalogo_cotizacion_publico
WITH (security_barrier = true) AS
SELECT p.id_producto, p.nombre, p.descripcion, p.unidad_medida, p.tipo_item, p.caracteristicas
FROM public.productos p
JOIN public.organizaciones o ON o.id_organizacion = p.id_organizacion
WHERE p.publicado AND p.archived_at IS NULL AND o.archived_at IS NULL;

REVOKE ALL ON public.catalogo_cotizacion_publico FROM PUBLIC, authenticated;
GRANT SELECT ON public.catalogo_cotizacion_publico TO anon;

CREATE OR REPLACE FUNCTION public.registrar_solicitud_cotizacion(p_datos jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_solicitud public.solicitudes_cotizacion;
  v_item jsonb;
  v_id_producto uuid;
  v_cantidad numeric;
BEGIN
  IF jsonb_typeof(p_datos) <> 'object'
     OR btrim(COALESCE(p_datos->>'nombre_solicitante', '')) = ''
     OR btrim(COALESCE(p_datos->>'correo', '')) = ''
     OR jsonb_typeof(p_datos->'items') <> 'array'
     OR jsonb_array_length(p_datos->'items') < 1 THEN
    RAISE EXCEPTION 'Datos de solicitud inválidos' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.solicitudes_cotizacion(nombre_solicitante, correo, telefono, mensaje)
  VALUES (
    left(btrim(p_datos->>'nombre_solicitante'), 160),
    lower(left(btrim(p_datos->>'correo'), 320)),
    nullif(left(btrim(COALESCE(p_datos->>'telefono', '')), 60), ''),
    nullif(left(btrim(COALESCE(p_datos->>'mensaje', '')), 2000), '')
  ) RETURNING * INTO v_solicitud;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
    BEGIN
      v_id_producto := (v_item->>'id_producto')::uuid;
      v_cantidad := (v_item->>'cantidad')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Producto o cantidad inválidos' USING ERRCODE = '22023';
    END;
    INSERT INTO public.solicitud_cotizacion_detalles(id_solicitud, id_producto, cantidad)
    VALUES (v_solicitud.id_solicitud, v_id_producto, v_cantidad);
  END LOOP;

  RETURN jsonb_build_object('id_solicitud', v_solicitud.id_solicitud, 'estado', v_solicitud.estado);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'La solicitud contiene productos repetidos' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_solicitud_cotizacion(jsonb) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_solicitud_cotizacion(jsonb) TO anon;

COMMIT;
