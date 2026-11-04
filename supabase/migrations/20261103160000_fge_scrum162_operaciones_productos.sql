BEGIN;

CREATE FUNCTION fge_private.es_admin_productos() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.asignaciones_roles a
    JOIN public.roles r ON r.id_rol=a.id_rol AND r.activo AND r.archived_at IS NULL
    JOIN public.perfiles p ON p.id_usuario=a.id_usuario AND p.activo AND p.archived_at IS NULL
    WHERE a.id_usuario=auth.uid() AND a.revocado_at IS NULL AND a.archived_at IS NULL AND r.codigo='ADMIN');
$$;

-- La administración se limita también en Data API, sin depender del Gateway.
ALTER POLICY productos_consulta ON public.productos USING (fge_private.es_admin_productos());
ALTER POLICY productos_alta ON public.productos WITH CHECK (
  fge_private.es_admin_productos() AND archived_at IS NULL AND fge_private.acceso_organizacion_producto(id_organizacion,true));
ALTER POLICY productos_modificacion ON public.productos
USING (fge_private.es_admin_productos() AND archived_at IS NULL)
WITH CHECK (fge_private.es_admin_productos());

CREATE OR REPLACE FUNCTION fge_private.acceso_organizacion_producto(p_organizacion uuid, p_gestion boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.organizaciones o
    JOIN public.paises pais ON pais.id_pais=o.id_pais AND pais.archived_at IS NULL
    WHERE o.id_organizacion=p_organizacion AND o.archived_at IS NULL
      AND fge_private.es_admin_productos());
$$;

CREATE FUNCTION fge_private.validar_campos_producto(p_datos jsonb, p_creacion boolean) RETURNS jsonb
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE campo text; maximo integer; resultado jsonb := p_datos;
BEGIN
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR p_datos='{}'::jsonb
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_datos) k WHERE k <> ALL(ARRAY[
      'nombre','descripcion','unidad_medida','tipo_item','categoria','material_terminacion','caracteristicas','informacion_adicional'])) THEN
    RAISE EXCEPTION 'Campos inválidos' USING ERRCODE='22023';
  END IF;
  IF p_creacion AND NOT(p_datos ?& ARRAY['nombre','descripcion','unidad_medida']) THEN
    RAISE EXCEPTION 'Faltan campos obligatorios' USING ERRCODE='22023';
  END IF;
  FOR campo,maximo IN SELECT * FROM (VALUES('nombre',200),('descripcion',10000),('unidad_medida',100),
    ('categoria',200),('material_terminacion',500),('informacion_adicional',10000)) v LOOP
    IF p_datos ? campo THEN
      IF p_datos->campo='null'::jsonb AND campo IN ('categoria','material_terminacion','informacion_adicional') THEN CONTINUE; END IF;
      IF jsonb_typeof(p_datos->campo) IS DISTINCT FROM 'string'
        OR NOT (p_datos->>campo ~ '[^[:space:]]') OR length(p_datos->>campo)>maximo THEN
        RAISE EXCEPTION 'Texto inválido' USING ERRCODE='22023';
      END IF;
      resultado := jsonb_set(resultado,ARRAY[campo],to_jsonb(btrim(p_datos->>campo)));
    END IF;
  END LOOP;
  IF p_datos ? 'tipo_item' AND (jsonb_typeof(p_datos->'tipo_item') <> 'string' OR p_datos->>'tipo_item' NOT IN ('producto','servicio')) THEN
    RAISE EXCEPTION 'Tipo inválido' USING ERRCODE='22023';
  END IF;
  IF p_datos ? 'caracteristicas' AND jsonb_typeof(p_datos->'caracteristicas') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Características inválidas' USING ERRCODE='22023';
  END IF;
  RETURN resultado;
END;
$$;

CREATE FUNCTION fge_private.validar_filtros_productos(p_datos jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE campo text; valor numeric;
BEGIN
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_datos) k
    WHERE k <> ALL(ARRAY['id_pais','id_organizacion','limit','offset'])) THEN
    RAISE EXCEPTION 'Filtros inválidos' USING ERRCODE='22023';
  END IF;
  FOREACH campo IN ARRAY ARRAY['limit','offset'] LOOP
    IF p_datos ? campo THEN
      IF jsonb_typeof(p_datos->campo) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Paginación inválida' USING ERRCODE='22023'; END IF;
      valor := (p_datos->>campo)::numeric;
      IF valor<>trunc(valor) OR (campo='limit' AND (valor<1 OR valor>100))
        OR (campo='offset' AND (valor<0 OR valor>100000)) THEN
        RAISE EXCEPTION 'Paginación fuera de rango' USING ERRCODE='22023';
      END IF;
    END IF;
  END LOOP;
  IF p_datos ? 'id_pais' AND (jsonb_typeof(p_datos->'id_pais') IS DISTINCT FROM 'string'
    OR NOT EXISTS(SELECT 1 FROM public.paises WHERE id_pais=(p_datos->>'id_pais')::uuid AND archived_at IS NULL)) THEN
    RAISE EXCEPTION 'País no disponible' USING ERRCODE='P0165';
  END IF;
  IF p_datos ? 'id_organizacion' AND (jsonb_typeof(p_datos->'id_organizacion') IS DISTINCT FROM 'string'
    OR NOT EXISTS(SELECT 1 FROM public.organizaciones o JOIN public.paises p ON p.id_pais=o.id_pais
      WHERE o.id_organizacion=(p_datos->>'id_organizacion')::uuid AND o.archived_at IS NULL AND p.archived_at IS NULL)) THEN
    RAISE EXCEPTION 'Organización no disponible' USING ERRCODE='P0165';
  END IF;
END;
$$;

CREATE FUNCTION fge_private.producto_publico(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id_producto',p.id_producto,'nombre',p.nombre,'descripcion',p.descripcion,
    'unidad_medida',p.unidad_medida,'tipo_item',p.tipo_item,'categoria',p.categoria,
    'material_terminacion',p.material_terminacion,'caracteristicas',p.caracteristicas,'informacion_adicional',p.informacion_adicional,
    'organizacion',jsonb_build_object('id_organizacion',o.id_organizacion,'nombre',o.nombre),
    'pais',jsonb_build_object('id_pais',pais.id_pais,'nombre',pais.nombre,'codigo_iso',pais.codigo_iso),
    'imagenes',coalesce((SELECT jsonb_agg(jsonb_build_object('id_archivo',a.id_archivo,'descripcion',a.descripcion,'mime_type',a.mime_type)
      ORDER BY a.created_at,a.id_archivo) FROM public.archivos a WHERE a.id_producto=p.id_producto
      AND a.categoria='imagen_producto' AND a.estado_carga='disponible' AND a.archived_at IS NULL),'[]'::jsonb))
  FROM public.productos p JOIN public.organizaciones o ON o.id_organizacion=p.id_organizacion
    JOIN public.paises pais ON pais.id_pais=o.id_pais
  WHERE p.id_producto=p_id AND p.publicado AND p.archived_at IS NULL AND o.archived_at IS NULL AND pais.archived_at IS NULL;
$$;

CREATE FUNCTION public.consultar_productos_publicos(p_operacion text, p_datos jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE resultado jsonb; limite integer; desplazamiento integer;
BEGIN
  IF p_operacion='get' THEN
    IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' OR jsonb_typeof(p_datos->'id_producto') IS DISTINCT FROM 'string'
      OR (p_datos-'id_producto')<>'{}'::jsonb THEN RAISE EXCEPTION 'Identificador inválido' USING ERRCODE='22023'; END IF;
    resultado := fge_private.producto_publico((p_datos->>'id_producto')::uuid);
    IF resultado IS NULL THEN RAISE EXCEPTION 'Producto no disponible' USING ERRCODE='P0162'; END IF;
    RETURN resultado;
  ELSIF p_operacion <> 'list' OR p_operacion IS NULL THEN
    RAISE EXCEPTION 'Operación no admitida' USING ERRCODE='22023';
  END IF;
  PERFORM fge_private.validar_filtros_productos(p_datos);
  limite := coalesce((p_datos->>'limit')::numeric::integer,50);
  desplazamiento := coalesce((p_datos->>'offset')::numeric::integer,0);
  WITH candidatos AS (
    SELECT p.id_producto,p.nombre FROM public.productos p
    JOIN public.organizaciones o ON o.id_organizacion=p.id_organizacion
    JOIN public.paises pais ON pais.id_pais=o.id_pais
    WHERE p.publicado AND p.archived_at IS NULL AND o.archived_at IS NULL AND pais.archived_at IS NULL
      AND (NOT(p_datos ? 'id_pais') OR o.id_pais=(p_datos->>'id_pais')::uuid)
      AND (NOT(p_datos ? 'id_organizacion') OR o.id_organizacion=(p_datos->>'id_organizacion')::uuid)
    ORDER BY p.nombre,p.id_producto LIMIT limite+1 OFFSET desplazamiento
  ), pagina AS (SELECT * FROM candidatos ORDER BY nombre,id_producto LIMIT limite)
  SELECT jsonb_build_object('products',coalesce((SELECT jsonb_agg(fge_private.producto_publico(id_producto) ORDER BY nombre,id_producto) FROM pagina),'[]'::jsonb),
    'limit',limite,'offset',desplazamiento,'hasMore',(SELECT count(*)>limite FROM candidatos)) INTO resultado;
  RETURN resultado;
END;
$$;

CREATE FUNCTION public.administrar_productos_cotizacion(p_operacion text, p_datos jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE producto public.productos; campos jsonb; org uuid; limite integer; desplazamiento integer; resultado jsonb; version_esperada bigint;
BEGIN
  IF NOT fge_private.es_admin_productos() THEN RAISE EXCEPTION 'Solo ADMIN activo' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida' USING ERRCODE='22023'; END IF;
  IF p_operacion='authorize' THEN
    IF p_datos<>'{}'::jsonb THEN RAISE EXCEPTION 'Parámetros no admitidos' USING ERRCODE='22023'; END IF;
    RETURN '{"authorized":true}'::jsonb;
  END IF;
  IF p_operacion='list' THEN
    PERFORM fge_private.validar_filtros_productos(p_datos);
    limite := coalesce((p_datos->>'limit')::numeric::integer,50); desplazamiento := coalesce((p_datos->>'offset')::numeric::integer,0);
    WITH candidatos AS (
      SELECT p.*,o.id_pais FROM public.productos p JOIN public.organizaciones o ON o.id_organizacion=p.id_organizacion
      WHERE p.archived_at IS NULL
        AND (NOT(p_datos ? 'id_pais') OR o.id_pais=(p_datos->>'id_pais')::uuid)
        AND (NOT(p_datos ? 'id_organizacion') OR o.id_organizacion=(p_datos->>'id_organizacion')::uuid)
      ORDER BY p.nombre,p.id_producto LIMIT limite+1 OFFSET desplazamiento
    ), pagina AS (SELECT * FROM candidatos ORDER BY nombre,id_producto LIMIT limite)
    SELECT jsonb_build_object('products',coalesce((SELECT jsonb_agg(to_jsonb(pagina) ORDER BY nombre,id_producto) FROM pagina),'[]'::jsonb),
      'limit',limite,'offset',desplazamiento,'hasMore',(SELECT count(*)>limite FROM candidatos)) INTO resultado;
    RETURN resultado;
  END IF;
  IF p_operacion='create' THEN
    IF jsonb_typeof(p_datos->'id_organizacion') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Organización obligatoria' USING ERRCODE='22023'; END IF;
    org := (p_datos->>'id_organizacion')::uuid;
    campos := fge_private.validar_campos_producto(p_datos-'id_organizacion',true);
  ELSIF p_operacion IN ('get','update','activate','deactivate') THEN
    IF jsonb_typeof(p_datos->'id_producto') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Identificador obligatorio' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_datos) k WHERE k <> ALL(
      CASE WHEN p_operacion='get' THEN ARRAY['id_producto'] WHEN p_operacion='update' THEN ARRAY['id_producto','version_esperada','cambios']
      ELSE ARRAY['id_producto','version_esperada'] END)) THEN RAISE EXCEPTION 'Campos desconocidos' USING ERRCODE='22023'; END IF;
    SELECT * INTO producto FROM public.productos WHERE id_producto=(p_datos->>'id_producto')::uuid AND archived_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado' USING ERRCODE='P0162'; END IF;
    IF p_operacion='get' THEN RETURN to_jsonb(producto) || jsonb_build_object('id_pais',(SELECT id_pais FROM public.organizaciones WHERE id_organizacion=producto.id_organizacion)); END IF;
    IF jsonb_typeof(p_datos->'version_esperada') IS DISTINCT FROM 'number'
      OR (p_datos->>'version_esperada')::numeric NOT BETWEEN 1 AND 9007199254740991
      OR (p_datos->>'version_esperada')::numeric<>trunc((p_datos->>'version_esperada')::numeric) THEN
      RAISE EXCEPTION 'Versión inválida' USING ERRCODE='22023'; END IF;
    version_esperada := (p_datos->>'version_esperada')::numeric::bigint;
    IF producto.version<>version_esperada THEN RAISE EXCEPTION 'Versión desactualizada' USING ERRCODE='40001'; END IF;
    org := producto.id_organizacion;
    IF p_operacion='update' THEN campos := fge_private.validar_campos_producto(p_datos->'cambios',false); END IF;
  ELSE RAISE EXCEPTION 'Operación no admitida' USING ERRCODE='22023'; END IF;

  -- Bloquea la Organización y país durante la escritura, evitando publicar
  -- mientras otra transacción los archiva. Desactivar siempre sigue permitido.
  IF p_operacion<>'deactivate' THEN
    IF NOT EXISTS(SELECT 1 FROM public.organizaciones WHERE id_organizacion=org) THEN
      RAISE EXCEPTION 'Organización no encontrada' USING ERRCODE='P0163'; END IF;
    PERFORM 1 FROM public.organizaciones o JOIN public.paises p ON p.id_pais=o.id_pais
      WHERE o.id_organizacion=org AND o.archived_at IS NULL AND p.archived_at IS NULL FOR SHARE OF o,p;
    IF NOT FOUND THEN RAISE EXCEPTION 'Organización o país inactivo' USING ERRCODE='P0164'; END IF;
  END IF;
  IF p_operacion='create' THEN
    INSERT INTO public.productos(id_organizacion,nombre,descripcion,unidad_medida,tipo_item,categoria,material_terminacion,caracteristicas,informacion_adicional)
    VALUES(org,campos->>'nombre',campos->>'descripcion',campos->>'unidad_medida',coalesce(campos->>'tipo_item','producto'),
      campos->>'categoria',campos->>'material_terminacion',coalesce(campos->'caracteristicas','{}'::jsonb),campos->>'informacion_adicional')
    RETURNING * INTO producto;
  ELSIF p_operacion='update' THEN
    UPDATE public.productos SET
      nombre=CASE WHEN campos ? 'nombre' THEN campos->>'nombre' ELSE nombre END,
      descripcion=CASE WHEN campos ? 'descripcion' THEN campos->>'descripcion' ELSE descripcion END,
      unidad_medida=CASE WHEN campos ? 'unidad_medida' THEN campos->>'unidad_medida' ELSE unidad_medida END,
      tipo_item=CASE WHEN campos ? 'tipo_item' THEN campos->>'tipo_item' ELSE tipo_item END,
      categoria=CASE WHEN campos ? 'categoria' THEN campos->>'categoria' ELSE categoria END,
      material_terminacion=CASE WHEN campos ? 'material_terminacion' THEN campos->>'material_terminacion' ELSE material_terminacion END,
      caracteristicas=CASE WHEN campos ? 'caracteristicas' THEN campos->'caracteristicas' ELSE caracteristicas END,
      informacion_adicional=CASE WHEN campos ? 'informacion_adicional' THEN campos->>'informacion_adicional' ELSE informacion_adicional END
    WHERE id_producto=producto.id_producto RETURNING * INTO producto;
  ELSE
    UPDATE public.productos SET publicado=(p_operacion='activate') WHERE id_producto=producto.id_producto RETURNING * INTO producto;
  END IF;
  RETURN to_jsonb(producto) || jsonb_build_object('id_pais',(SELECT id_pais FROM public.organizaciones WHERE id_organizacion=org));
END;
$$;

REVOKE ALL ON FUNCTION fge_private.es_admin_productos(), fge_private.validar_campos_producto(jsonb,boolean),
  fge_private.validar_filtros_productos(jsonb), fge_private.producto_publico(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION fge_private.es_admin_productos() TO authenticated;
REVOKE ALL ON FUNCTION public.administrar_productos_cotizacion(text,jsonb), public.consultar_productos_publicos(text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.administrar_productos_cotizacion(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.consultar_productos_publicos(text,jsonb) TO anon, authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
