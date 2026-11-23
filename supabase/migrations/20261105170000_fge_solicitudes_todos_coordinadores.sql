BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_solicitud_cotizacion(p_datos jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE campo text; maximo integer; item jsonb; pais uuid; responsable uuid; cantidad_responsables integer;
  envio uuid:=gen_random_uuid();solicitud uuid; primera uuid;confirmaciones jsonb:='[]';
BEGIN
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_datos) k
    WHERE k<>ALL(ARRAY['nombre','apellido','nombre_solicitante','correo','telefono','mensaje','items'])) THEN
    RAISE EXCEPTION 'Solicitud inválida' USING ERRCODE='22023'; END IF;
  FOR campo,maximo IN SELECT * FROM (VALUES('nombre',80),('apellido',80),('correo',320)) v LOOP
    IF jsonb_typeof(p_datos->campo) IS DISTINCT FROM 'string' OR NOT(p_datos->>campo ~ '[^[:space:]]') OR length(p_datos->>campo)>maximo THEN
      RAISE EXCEPTION 'Datos de contacto inválidos' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_datos->>'correo' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'Correo inválido' USING ERRCODE='22023'; END IF;
  FOR campo,maximo IN SELECT * FROM (VALUES('telefono',60),('mensaje',2000)) v LOOP
    IF p_datos ? campo AND (jsonb_typeof(p_datos->campo) IS DISTINCT FROM 'string' OR length(p_datos->>campo)>maximo) THEN
      RAISE EXCEPTION 'Contacto inválido' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF p_datos ? 'nombre_solicitante' AND (jsonb_typeof(p_datos->'nombre_solicitante') IS DISTINCT FROM 'string'
    OR p_datos->>'nombre_solicitante'<>btrim(p_datos->>'nombre')||' '||btrim(p_datos->>'apellido')) THEN RAISE EXCEPTION 'Nombre incoherente' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(p_datos->'items') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Productos obligatorios' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p_datos->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Cantidad de productos inválida' USING ERRCODE='22023'; END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_datos->'items') LOOP
    IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR jsonb_typeof(item->'id_producto') IS DISTINCT FROM 'string'
      OR jsonb_typeof(item->'cantidad') IS DISTINCT FROM 'number' OR EXISTS(SELECT 1 FROM jsonb_object_keys(item) k WHERE k<>ALL(ARRAY['id_producto','cantidad'])) THEN
      RAISE EXCEPTION 'Producto o cantidad inválidos' USING ERRCODE='22023'; END IF;
    IF (item->>'cantidad')::numeric NOT BETWEEN 0 AND 9007199254740991 OR (item->>'cantidad')::numeric=0 THEN RAISE EXCEPTION 'Cantidad inválida' USING ERRCODE='22023'; END IF;
    PERFORM (item->>'id_producto')::uuid;
  END LOOP;
  IF (SELECT count(DISTINCT(value->>'id_producto')::uuid) FROM jsonb_array_elements(p_datos->'items'))<>jsonb_array_length(p_datos->'items') THEN
    RAISE EXCEPTION 'Productos repetidos' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.productos p JOIN public.organizaciones o ON o.id_organizacion=p.id_organizacion
    JOIN public.paises pais ON pais.id_pais=o.id_pais
    WHERE p.id_producto IN (SELECT(value->>'id_producto')::uuid FROM jsonb_array_elements(p_datos->'items'))
    ORDER BY p.id_producto FOR SHARE OF p,o,pais;
  IF (SELECT count(*) FROM public.productos p JOIN public.organizaciones o ON o.id_organizacion=p.id_organizacion
    JOIN public.paises pais ON pais.id_pais=o.id_pais WHERE p.publicado AND p.archived_at IS NULL AND o.archived_at IS NULL AND pais.archived_at IS NULL
      AND p.id_producto IN (SELECT(value->>'id_producto')::uuid FROM jsonb_array_elements(p_datos->'items')))<>jsonb_array_length(p_datos->'items') THEN
    RAISE EXCEPTION 'Producto no disponible' USING ERRCODE='P0166'; END IF;
  FOR pais IN SELECT DISTINCT o.id_pais FROM public.productos p JOIN public.organizaciones o ON o.id_organizacion=p.id_organizacion
    WHERE p.id_producto IN (SELECT(value->>'id_producto')::uuid FROM jsonb_array_elements(p_datos->'items')) ORDER BY o.id_pais LOOP
    SELECT count(*),(array_agg(c.id_usuario ORDER BY c.id_usuario))[1] INTO cantidad_responsables,responsable FROM fge_private.coordinadores_cotizacion() c WHERE c.id_pais=pais;
    INSERT INTO public.solicitudes_cotizacion(nombre,apellido,nombre_solicitante,correo,telefono,mensaje,id_envio,id_pais,id_coordinador,sin_coordinador_al_recibir)
    VALUES(btrim(p_datos->>'nombre'),btrim(p_datos->>'apellido'),btrim(p_datos->>'nombre')||' '||btrim(p_datos->>'apellido'),lower(btrim(p_datos->>'correo')),
      nullif(btrim(p_datos->>'telefono'),''),nullif(btrim(p_datos->>'mensaje'),''),envio,pais,responsable,cantidad_responsables=0)
    RETURNING id_solicitud INTO solicitud;
    IF primera IS NULL THEN primera:=solicitud; END IF;
    INSERT INTO public.solicitud_cotizacion_detalles(id_solicitud,id_producto,cantidad)
    SELECT solicitud,p.id_producto,(i.value->>'cantidad')::numeric FROM jsonb_array_elements(p_datos->'items') i
      JOIN public.productos p ON p.id_producto=(i.value->>'id_producto')::uuid
      JOIN public.organizaciones o ON o.id_organizacion=p.id_organizacion WHERE o.id_pais=pais ORDER BY p.id_producto;
    IF responsable IS NOT NULL THEN
      INSERT INTO public.solicitud_cotizacion_destinatarios(id_solicitud,id_coordinador,tipo)
      SELECT DISTINCT solicitud,c.id_usuario,'responsable' FROM fge_private.coordinadores_cotizacion() c WHERE c.id_pais=pais;
    ELSE
      INSERT INTO public.solicitud_cotizacion_destinatarios(id_solicitud,id_coordinador,tipo)
      SELECT solicitud,c.id_usuario,'informado' FROM fge_private.coordinadores_cotizacion() c WHERE c.id_pais<>pais;
    END IF;
    confirmaciones:=confirmaciones||jsonb_build_array(jsonb_build_object('id_solicitud',solicitud,'estado','solicitada'));
  END LOOP;
  RETURN jsonb_build_object('id_solicitud',primera,'estado','solicitada','id_envio',envio,'solicitudes',confirmaciones);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_solicitud_cotizacion(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_solicitud_cotizacion(jsonb) TO anon;
NOTIFY pgrst, 'reload schema';
COMMIT;
