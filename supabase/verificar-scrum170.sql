BEGIN;
SET LOCAL search_path = public, extensions;

CREATE TEMP TABLE scrum170_resultados (
  prueba text NOT NULL,
  resultado text NOT NULL,
  detalle text
) ON COMMIT DROP;

DO $$
DECLARE
  organizacion uuid;
  producto uuid := gen_random_uuid();
  solicitud jsonb;
  catalogo jsonb;
  escritura_directa_bloqueada boolean := false;
BEGIN
  IF to_regclass('public.catalogo_cotizacion_publico') IS NULL THEN
    RAISE EXCEPTION 'Falta la vista public.catalogo_cotizacion_publico';
  END IF;
  IF to_regprocedure('public.registrar_solicitud_cotizacion(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Falta la función pública registrar_solicitud_cotizacion(jsonb)';
  END IF;
  INSERT INTO scrum170_resultados VALUES ('objetos de migración', 'OK', 'Vista y función existen');

  IF NOT has_table_privilege('anon', 'public.catalogo_cotizacion_publico', 'SELECT')
     OR has_table_privilege('authenticated', 'public.catalogo_cotizacion_publico', 'SELECT') THEN
    RAISE EXCEPTION 'Permisos incorrectos sobre la vista pública';
  END IF;
  IF NOT has_function_privilege('anon', 'public.registrar_solicitud_cotizacion(jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.registrar_solicitud_cotizacion(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Permisos incorrectos sobre la función pública';
  END IF;
  INSERT INTO scrum170_resultados VALUES ('permisos públicos', 'OK', 'anon solo consulta catálogo y ejecuta RPC');

  IF has_table_privilege('anon', 'public.productos', 'SELECT')
     OR has_table_privilege('anon', 'public.organizaciones', 'SELECT')
     OR has_table_privilege('anon', 'public.solicitudes_cotizacion', 'SELECT')
     OR has_table_privilege('anon', 'public.solicitud_cotizacion_detalles', 'SELECT') THEN
    RAISE EXCEPTION 'anon tiene lectura directa sobre tablas internas';
  END IF;
  INSERT INTO scrum170_resultados VALUES ('no exposición de tablas internas', 'OK', 'anon no puede consultar tablas base');

  SELECT o.id_organizacion INTO organizacion
  FROM public.organizaciones o
  WHERE o.archived_at IS NULL
  ORDER BY o.id_organizacion
  LIMIT 1;
  IF organizacion IS NULL THEN
    RAISE EXCEPTION 'Se requiere una Organización activa para ejecutar la validación';
  END IF;

  INSERT INTO public.productos(id_producto, id_organizacion, nombre, descripcion, unidad_medida, tipo_item, publicado, caracteristicas)
  VALUES (producto, organizacion, 'SCRUM-170 QA', 'Registro sintético revertido al terminar', 'unidad', 'producto', true, '{"origen":"qa"}'::jsonb);

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'catalogo_cotizacion_publico'
      AND column_name IN ('id_organizacion', 'created_by', 'updated_by', 'archived_at', 'version')
  ) THEN
    RAISE EXCEPTION 'La proyección pública incluye columnas internas';
  END IF;

  SET LOCAL ROLE anon;
  SELECT to_jsonb(c) INTO catalogo
  FROM public.catalogo_cotizacion_publico c
  WHERE c.id_producto = producto;
  IF catalogo IS NULL OR catalogo ? 'id_organizacion' OR catalogo ? 'created_by' THEN
    RAISE EXCEPTION 'El catálogo público no devuelve la proyección esperada';
  END IF;
  SELECT public.registrar_solicitud_cotizacion(jsonb_build_object(
    'nombre', 'Visitante',
    'apellido', 'SCRUM-170',
    'correo', 'scrum170@example.invalid',
    'telefono', '+56900000000',
    'mensaje', 'Solicitud sintética de validación',
    'items', jsonb_build_array(jsonb_build_object('id_producto', producto, 'cantidad', 2))
  )) INTO solicitud;
  IF solicitud->>'id_solicitud' IS NULL OR solicitud->>'estado' <> 'solicitada'
     OR solicitud->>'id_envio' IS NULL THEN
    RAISE EXCEPTION 'La RPC no devolvió una solicitud válida: %', solicitud;
  END IF;

  BEGIN
    INSERT INTO public.solicitudes_cotizacion(nombre_solicitante, correo)
    VALUES ('No permitido', 'no-permitido@example.invalid');
    RAISE EXCEPTION 'anon pudo insertar directamente en solicitudes_cotizacion';
  EXCEPTION WHEN insufficient_privilege THEN
    escritura_directa_bloqueada := true;
  END;
  RESET ROLE;

  INSERT INTO scrum170_resultados VALUES ('catálogo público sin datos internos', 'OK', catalogo::text);
  INSERT INTO scrum170_resultados VALUES ('registro público de solicitud', 'OK', solicitud::text);
  IF NOT escritura_directa_bloqueada THEN
    RAISE EXCEPTION 'anon pudo insertar directamente en solicitudes_cotizacion';
  END IF;
  INSERT INTO scrum170_resultados VALUES ('bloqueo de escritura directa', 'OK', 'INSERT directo rechazado');

  IF NOT EXISTS (
    SELECT 1
    FROM public.solicitudes_cotizacion s
    JOIN public.solicitud_cotizacion_detalles d USING (id_solicitud)
    WHERE s.id_solicitud = (solicitud->>'id_solicitud')::uuid
      AND s.id_envio = (solicitud->>'id_envio')::uuid
      AND s.nombre = 'Visitante'
      AND s.apellido = 'SCRUM-170'
      AND s.nombre_solicitante = 'Visitante SCRUM-170'
      AND s.correo = 'scrum170@example.invalid'
      AND d.id_producto = producto
      AND d.cantidad = 2
  ) THEN
    RAISE EXCEPTION 'La cabecera o el detalle no fueron persistidos por la RPC';
  END IF;
  INSERT INTO scrum170_resultados VALUES ('integridad solicitud-detalle', 'OK', 'Cabecera y detalle creados');
END $$;

SELECT * FROM scrum170_resultados ORDER BY prueba;
ROLLBACK;

