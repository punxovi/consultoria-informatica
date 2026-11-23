BEGIN;
ALTER TABLE public.solicitudes_cotizacion
  ADD COLUMN nombre text,
  ADD COLUMN apellido text,
  ADD COLUMN id_envio uuid,
  ADD COLUMN id_pais uuid REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  ADD COLUMN id_coordinador uuid REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  ADD COLUMN sin_coordinador_al_recibir boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT solicitud_contacto_territorial CHECK (id_envio IS NULL OR (
    nullif(btrim(nombre),'') IS NOT NULL AND nullif(btrim(apellido),'') IS NOT NULL AND id_pais IS NOT NULL
    AND ((id_coordinador IS NOT NULL AND NOT sin_coordinador_al_recibir) OR (id_coordinador IS NULL AND sin_coordinador_al_recibir))));

ALTER TABLE public.solicitud_cotizacion_detalles
  ADD COLUMN id_organizacion uuid REFERENCES public.organizaciones(id_organizacion) ON DELETE RESTRICT,
  ADD COLUMN id_pais uuid REFERENCES public.paises(id_pais) ON DELETE RESTRICT,
  ADD COLUMN nombre_organizacion text,
  ADD COLUMN nombre_pais text;
UPDATE public.solicitud_cotizacion_detalles d SET id_organizacion=o.id_organizacion,id_pais=o.id_pais,
  nombre_organizacion=o.nombre,nombre_pais=pais.nombre
FROM public.productos p JOIN public.organizaciones o ON o.id_organizacion=p.id_organizacion
JOIN public.paises pais ON pais.id_pais=o.id_pais WHERE d.id_producto=p.id_producto;

CREATE TABLE public.solicitud_cotizacion_destinatarios (
  id_solicitud uuid NOT NULL REFERENCES public.solicitudes_cotizacion(id_solicitud) ON DELETE RESTRICT,
  id_coordinador uuid NOT NULL REFERENCES public.perfiles(id_usuario) ON DELETE RESTRICT,
  tipo text NOT NULL CHECK(tipo IN ('responsable','informado')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(id_solicitud,id_coordinador)
);
ALTER TABLE public.solicitud_cotizacion_destinatarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.solicitud_cotizacion_destinatarios FROM PUBLIC,anon,authenticated;
CREATE TRIGGER auditar AFTER INSERT ON public.solicitud_cotizacion_destinatarios
FOR EACH ROW EXECUTE FUNCTION fge_private.auditar_registro('id_solicitud','id_coordinador');

CREATE FUNCTION fge_private.es_admin_cotizaciones() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT EXISTS(SELECT 1 FROM public.asignaciones_roles a JOIN public.roles r ON r.id_rol=a.id_rol
  JOIN public.perfiles p ON p.id_usuario=a.id_usuario WHERE a.id_usuario=auth.uid() AND p.activo AND p.archived_at IS NULL
  AND r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL AND a.revocado_at IS NULL AND a.archived_at IS NULL);
$$;
CREATE FUNCTION fge_private.coordinadores_cotizacion() RETURNS TABLE(id_usuario uuid,id_pais uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT DISTINCT a.id_usuario,a.id_pais FROM public.asignaciones_roles a
JOIN public.roles r ON r.id_rol=a.id_rol AND r.codigo='COORD' AND r.activo AND r.archived_at IS NULL
JOIN public.perfiles p ON p.id_usuario=a.id_usuario AND p.activo AND p.archived_at IS NULL
JOIN public.paises pais ON pais.id_pais=a.id_pais AND pais.archived_at IS NULL
LEFT JOIN fge_private.cuentas_coordinadores c ON c.id_usuario=a.id_usuario
WHERE a.alcance='pais' AND a.revocado_at IS NULL AND a.archived_at IS NULL
  AND ((c.id_usuario IS NOT NULL AND c.id_pais_aplicado=a.id_pais) OR (c.id_usuario IS NULL AND
    1=(SELECT count(*) FROM public.asignaciones_roles x JOIN public.roles y ON y.id_rol=x.id_rol
      WHERE x.id_usuario=a.id_usuario AND y.codigo='COORD' AND y.activo AND y.archived_at IS NULL
        AND x.alcance='pais' AND x.revocado_at IS NULL AND x.archived_at IS NULL)));
$$;
CREATE FUNCTION fge_private.acceso_solicitud_cotizacion(p_id uuid,p_escritura boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT EXISTS(SELECT 1 FROM public.solicitudes_cotizacion s WHERE s.id_solicitud=p_id AND s.archived_at IS NULL AND (
  fge_private.es_admin_cotizaciones() OR EXISTS(SELECT 1 FROM fge_private.coordinadores_cotizacion() c
    WHERE c.id_usuario=auth.uid() AND (c.id_pais=s.id_pais OR (NOT p_escritura AND EXISTS(
      SELECT 1 FROM public.solicitud_cotizacion_destinatarios d WHERE d.id_solicitud=s.id_solicitud AND d.id_coordinador=c.id_usuario AND d.tipo='informado'))))));
$$;

CREATE OR REPLACE FUNCTION fge_private.preparar_detalle_cotizacion() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE producto public.productos; organizacion public.organizaciones; pais public.paises; cabecera public.solicitudes_cotizacion;
BEGIN
  IF TG_OP='UPDATE' THEN
    IF ROW(NEW.id_producto,NEW.id_solicitud,NEW.cantidad,NEW.id_organizacion,NEW.id_pais,NEW.nombre_organizacion,NEW.nombre_pais)
      IS DISTINCT FROM ROW(OLD.id_producto,OLD.id_solicitud,OLD.cantidad,OLD.id_organizacion,OLD.id_pais,OLD.nombre_organizacion,OLD.nombre_pais) THEN
      RAISE EXCEPTION 'El detalle conserva su identidad, cantidad y referencias históricas' USING ERRCODE='23514'; END IF;
    NEW.nombre_producto:=OLD.nombre_producto;NEW.unidad_medida:=OLD.unidad_medida;
  ELSE
    SELECT * INTO producto FROM public.productos WHERE id_producto=NEW.id_producto AND publicado AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible' USING ERRCODE='P0166'; END IF;
    SELECT * INTO organizacion FROM public.organizaciones WHERE id_organizacion=producto.id_organizacion AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible' USING ERRCODE='P0166'; END IF;
    SELECT * INTO pais FROM public.paises WHERE id_pais=organizacion.id_pais AND archived_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto no disponible' USING ERRCODE='P0166'; END IF;
    SELECT * INTO cabecera FROM public.solicitudes_cotizacion WHERE id_solicitud=NEW.id_solicitud;
    IF cabecera.id_envio IS NOT NULL AND cabecera.id_pais IS DISTINCT FROM pais.id_pais THEN
      RAISE EXCEPTION 'Los productos de la solicitud deben pertenecer al mismo país' USING ERRCODE='23514'; END IF;
    NEW.nombre_producto:=producto.nombre;NEW.unidad_medida:=producto.unidad_medida;
    NEW.id_organizacion:=organizacion.id_organizacion;NEW.id_pais:=pais.id_pais;
    NEW.nombre_organizacion:=organizacion.nombre;NEW.nombre_pais:=pais.nombre;
  END IF;
  RETURN NEW;
END;
$$;
CREATE FUNCTION fge_private.conservar_solicitud_cotizacion() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF ROW(NEW.id_solicitud,NEW.nombre,NEW.apellido,NEW.nombre_solicitante,NEW.correo,NEW.telefono,NEW.mensaje,NEW.id_envio,NEW.id_pais,NEW.id_coordinador,NEW.sin_coordinador_al_recibir)
    IS DISTINCT FROM ROW(OLD.id_solicitud,OLD.nombre,OLD.apellido,OLD.nombre_solicitante,OLD.correo,OLD.telefono,OLD.mensaje,OLD.id_envio,OLD.id_pais,OLD.id_coordinador,OLD.sin_coordinador_al_recibir) THEN
    RAISE EXCEPTION 'Los datos de recepción y destinatario son históricos' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER conservar_solicitud BEFORE UPDATE ON public.solicitudes_cotizacion
FOR EACH ROW EXECUTE FUNCTION fge_private.conservar_solicitud_cotizacion();

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
    IF cantidad_responsables>1 THEN RAISE EXCEPTION 'Asignación de responsable ambigua' USING ERRCODE='P0167'; END IF;
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
      INSERT INTO public.solicitud_cotizacion_destinatarios VALUES(solicitud,responsable,'responsable',clock_timestamp());
    ELSE
      INSERT INTO public.solicitud_cotizacion_destinatarios(id_solicitud,id_coordinador,tipo)
      SELECT solicitud,c.id_usuario,'informado' FROM fge_private.coordinadores_cotizacion() c WHERE c.id_pais<>pais;
    END IF;
    confirmaciones:=confirmaciones||jsonb_build_array(jsonb_build_object('id_solicitud',solicitud,'estado','solicitada'));
  END LOOP;
  RETURN jsonb_build_object('id_solicitud',primera,'estado','solicitada','id_envio',envio,'solicitudes',confirmaciones);
END;
$$;

CREATE FUNCTION fge_private.detalle_solicitud_cotizacion(p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT jsonb_build_object('id_solicitud',s.id_solicitud,'nombre',s.nombre,'apellido',s.apellido,'nombre_solicitante',s.nombre_solicitante,
  'correo',s.correo,'telefono',s.telefono,'mensaje',s.mensaje,'id_envio',s.id_envio,'id_pais',s.id_pais,'id_coordinador',s.id_coordinador,
  'sin_coordinador_al_recibir',s.sin_coordinador_al_recibir,'solo_informativa',NOT fge_private.acceso_solicitud_cotizacion(s.id_solicitud,true),
  'estado',s.estado,'created_at',s.created_at,'updated_at',s.updated_at,'version',s.version,
  'estados_permitidos',CASE WHEN fge_private.acceso_solicitud_cotizacion(s.id_solicitud,true) THEN
    (SELECT jsonb_agg(e) FROM unnest(ARRAY['solicitada','en_gestion','cotizada','cerrada','rechazada']) e WHERE e<>s.estado) ELSE '[]'::jsonb END,
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id_producto',d.id_producto,'nombre',d.nombre_producto,'nombre_producto',d.nombre_producto,
    'unidad_medida',d.unidad_medida,'cantidad',d.cantidad,'organizacion',jsonb_build_object('id_organizacion',d.id_organizacion,'nombre',d.nombre_organizacion,
      'pais',jsonb_build_object('id_pais',d.id_pais,'nombre',d.nombre_pais))) ORDER BY d.id_detalle)
    FROM public.solicitud_cotizacion_detalles d WHERE d.id_solicitud=s.id_solicitud AND d.archived_at IS NULL),'[]'::jsonb))
FROM public.solicitudes_cotizacion s WHERE s.id_solicitud=p_id;
$$;
CREATE FUNCTION public.gestionar_solicitudes_cotizacion(p_operacion text,p_datos jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fila public.solicitudes_cotizacion;limite integer;desplazamiento integer;resultado jsonb;version_esperada numeric;
BEGIN
  IF NOT fge_private.es_admin_cotizaciones() AND NOT EXISTS(SELECT 1 FROM fge_private.coordinadores_cotizacion() WHERE id_usuario=auth.uid()) THEN
    RAISE EXCEPTION 'Se requiere Administrador o Coordinador activo' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_datos) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Solicitud inválida' USING ERRCODE='22023'; END IF;
  IF p_operacion='list' THEN
    IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_datos) k WHERE k<>ALL(ARRAY['id_pais','estado','limit','offset'])) THEN RAISE EXCEPTION 'Filtros desconocidos' USING ERRCODE='22023'; END IF;
    IF p_datos ? 'id_pais' AND (jsonb_typeof(p_datos->'id_pais') IS DISTINCT FROM 'string' OR NOT EXISTS(
      SELECT 1 FROM public.paises WHERE id_pais=(p_datos->>'id_pais')::uuid AND archived_at IS NULL)) THEN RAISE EXCEPTION 'País no disponible' USING ERRCODE='P0169'; END IF;
    IF p_datos ? 'estado' AND (jsonb_typeof(p_datos->'estado') IS DISTINCT FROM 'string' OR p_datos->>'estado' NOT IN ('solicitada','en_gestion','cotizada','cerrada','rechazada')) THEN RAISE EXCEPTION 'Estado inválido' USING ERRCODE='22023'; END IF;
    IF (p_datos ? 'limit' AND (jsonb_typeof(p_datos->'limit')<>'number' OR (p_datos->>'limit')::numeric NOT BETWEEN 1 AND 100 OR trunc((p_datos->>'limit')::numeric)<>(p_datos->>'limit')::numeric))
      OR(p_datos ? 'offset' AND (jsonb_typeof(p_datos->'offset')<>'number' OR (p_datos->>'offset')::numeric NOT BETWEEN 0 AND 100000 OR trunc((p_datos->>'offset')::numeric)<>(p_datos->>'offset')::numeric)) THEN RAISE EXCEPTION 'Paginación inválida' USING ERRCODE='22023'; END IF;
    limite:=coalesce((p_datos->>'limit')::integer,50);desplazamiento:=coalesce((p_datos->>'offset')::integer,0);
    WITH candidatos AS(SELECT s.id_solicitud,s.created_at FROM public.solicitudes_cotizacion s WHERE s.archived_at IS NULL
      AND fge_private.acceso_solicitud_cotizacion(s.id_solicitud,false)
      AND(NOT(p_datos ? 'id_pais') OR s.id_pais=(p_datos->>'id_pais')::uuid) AND(NOT(p_datos ? 'estado') OR s.estado=p_datos->>'estado')
      ORDER BY s.created_at DESC,s.id_solicitud LIMIT limite+1 OFFSET desplazamiento),pagina AS(SELECT * FROM candidatos ORDER BY created_at DESC,id_solicitud LIMIT limite)
    SELECT jsonb_build_object('requests',coalesce((SELECT jsonb_agg(fge_private.detalle_solicitud_cotizacion(id_solicitud) ORDER BY created_at DESC,id_solicitud) FROM pagina),'[]'::jsonb),
      'limit',limite,'offset',desplazamiento,'hasMore',(SELECT count(*)>limite FROM candidatos)) INTO resultado;
    RETURN resultado;
  END IF;
  IF p_operacion NOT IN ('get','update') OR p_operacion IS NULL OR jsonb_typeof(p_datos->'id_solicitud') IS DISTINCT FROM 'string'
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_datos) k WHERE k<>ALL(CASE WHEN p_operacion='get' THEN ARRAY['id_solicitud'] ELSE ARRAY['id_solicitud','version_esperada','estado'] END)) THEN
    RAISE EXCEPTION 'Operación inválida' USING ERRCODE='22023'; END IF;
  SELECT * INTO fila FROM public.solicitudes_cotizacion WHERE id_solicitud=(p_datos->>'id_solicitud')::uuid AND archived_at IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT fge_private.acceso_solicitud_cotizacion(fila.id_solicitud,false) THEN RAISE EXCEPTION 'Solicitud no disponible' USING ERRCODE='P0168'; END IF;
  IF p_operacion='get' THEN RETURN fge_private.detalle_solicitud_cotizacion(fila.id_solicitud); END IF;
  IF NOT fge_private.acceso_solicitud_cotizacion(fila.id_solicitud,true) THEN RAISE EXCEPTION 'Solicitud informativa, sin permiso de edición' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_datos->'version_esperada') IS DISTINCT FROM 'number' OR (p_datos->>'version_esperada')::numeric NOT BETWEEN 1 AND 9007199254740991
    OR trunc((p_datos->>'version_esperada')::numeric)<>(p_datos->>'version_esperada')::numeric OR jsonb_typeof(p_datos->'estado') IS DISTINCT FROM 'string'
    OR p_datos->>'estado' NOT IN ('solicitada','en_gestion','cotizada','cerrada','rechazada') THEN RAISE EXCEPTION 'Estado o versión inválidos' USING ERRCODE='22023'; END IF;
  version_esperada:=(p_datos->>'version_esperada')::numeric;
  IF fila.version<>version_esperada THEN RAISE EXCEPTION 'La solicitud cambió' USING ERRCODE='40001'; END IF;
  UPDATE public.solicitudes_cotizacion SET estado=p_datos->>'estado' WHERE id_solicitud=fila.id_solicitud;
  RETURN fge_private.detalle_solicitud_cotizacion(fila.id_solicitud);
END;
$$;
CREATE OR REPLACE FUNCTION public.consultar_solicitudes_cotizacion() RETURNS SETOF jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT jsonb_array_elements(public.gestionar_solicitudes_cotizacion('list','{}')->'requests'); $$;
CREATE OR REPLACE FUNCTION public.actualizar_estado_solicitud_cotizacion(p_id_solicitud uuid,p_version_esperada bigint,p_estado text) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.gestionar_solicitudes_cotizacion('update',jsonb_build_object('id_solicitud',p_id_solicitud,'version_esperada',p_version_esperada,'estado',p_estado)); $$;

REVOKE ALL ON FUNCTION fge_private.es_admin_cotizaciones(),fge_private.coordinadores_cotizacion(),fge_private.acceso_solicitud_cotizacion(uuid,boolean),
  fge_private.conservar_solicitud_cotizacion(),fge_private.detalle_solicitud_cotizacion(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION fge_private.acceso_solicitud_cotizacion(uuid,boolean) TO authenticated;
REVOKE ALL ON public.solicitudes_cotizacion,public.solicitud_cotizacion_detalles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.solicitudes_cotizacion,public.solicitud_cotizacion_detalles TO authenticated;
CREATE POLICY solicitudes_cotizacion_lectura ON public.solicitudes_cotizacion FOR SELECT TO authenticated USING(fge_private.acceso_solicitud_cotizacion(id_solicitud,false));
CREATE POLICY detalles_cotizacion_lectura ON public.solicitud_cotizacion_detalles FOR SELECT TO authenticated USING(fge_private.acceso_solicitud_cotizacion(id_solicitud,false));
REVOKE ALL ON FUNCTION public.registrar_solicitud_cotizacion(jsonb),public.gestionar_solicitudes_cotizacion(text,jsonb),
  public.consultar_solicitudes_cotizacion(),public.actualizar_estado_solicitud_cotizacion(uuid,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_solicitud_cotizacion(jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.gestionar_solicitudes_cotizacion(text,jsonb),public.consultar_solicitudes_cotizacion(),public.actualizar_estado_solicitud_cotizacion(uuid,bigint,text) TO authenticated;
CREATE INDEX solicitudes_envio_idx ON public.solicitudes_cotizacion(id_envio);
CREATE INDEX solicitudes_pais_recepcion_idx ON public.solicitudes_cotizacion(id_pais,created_at DESC,id_solicitud) WHERE archived_at IS NULL;
CREATE INDEX destinatarios_coordinador_idx ON public.solicitud_cotizacion_destinatarios(id_coordinador,id_solicitud);
NOTIFY pgrst,'reload schema';
COMMIT;
