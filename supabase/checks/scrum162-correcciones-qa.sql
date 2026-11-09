-- Ejecutar tras 20261109120000_fge_scrum162_correcciones_qa.sql.
-- Prueba de persistencia real; las comprobaciones HTTP se ejecutan localmente.
-- No envía correos ni modifica imágenes. Todas las escrituras se revierten.
BEGIN;
CREATE TEMP TABLE qa_scrum162_resultado(resultado jsonb) ON COMMIT DROP;
DO $qa$
DECLARE actor uuid; org uuid; pais uuid; producto public.productos; v bigint; n integer;
BEGIN
  SELECT a.id_usuario INTO actor FROM public.asignaciones_roles a JOIN public.roles r USING(id_rol)
    JOIN public.perfiles p USING(id_usuario) WHERE r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL
    AND a.revocado_at IS NULL AND a.archived_at IS NULL AND p.activo AND p.archived_at IS NULL LIMIT 1;
  SELECT o.id_organizacion,o.id_pais INTO org,pais FROM public.organizaciones o JOIN public.paises p USING(id_pais)
    WHERE o.archived_at IS NULL AND p.archived_at IS NULL LIMIT 1;
  IF actor IS NULL OR org IS NULL THEN RAISE EXCEPTION 'Se requiere un ADMIN activo y una Organización activa'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.productos(id_organizacion,nombre,descripcion,unidad_medida,material,terminacion,caracteristicas,informacion_adicional)
    VALUES(org,'QA SCRUM-162','Verificación transaccional','unidad','Madera','Barniz','{"origen":"QA"}','Sin inventario') RETURNING * INTO producto;
  IF producto.publicado OR producto.material_terminacion IS DISTINCT FROM 'Madera · Barniz' THEN
    RAISE EXCEPTION 'Alta o compatibilidad incorrectas'; END IF;
  v := producto.version;
  UPDATE public.productos SET material='Lino' WHERE id_producto=producto.id_producto AND version=v RETURNING * INTO producto;
  IF NOT FOUND OR producto.terminacion IS DISTINCT FROM 'Barniz' OR producto.created_by IS DISTINCT FROM actor
    OR producto.id_organizacion IS DISTINCT FROM org OR producto.caracteristicas IS DISTINCT FROM '{"origen":"QA"}'::jsonb THEN
    RAISE EXCEPTION 'PATCH parcial perdió datos'; END IF;
  UPDATE public.productos SET nombre='No debe persistir' WHERE id_producto=producto.id_producto AND version=v;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 OR NOT EXISTS(SELECT 1 FROM public.productos p WHERE p.id_producto=producto.id_producto) THEN
    RAISE EXCEPTION 'Control de versión incorrecto'; END IF;
  UPDATE public.productos SET material=NULL WHERE id_producto=producto.id_producto RETURNING * INTO producto;
  IF producto.terminacion IS DISTINCT FROM 'Barniz' OR producto.material_terminacion IS DISTINCT FROM 'Barniz' THEN
    RAISE EXCEPTION 'Limpiar material eliminó terminación'; END IF;
  UPDATE public.productos SET publicado=true WHERE id_producto=producto.id_producto;
  RESET ROLE;
  SET LOCAL ROLE anon;
  SELECT count(*) INTO n FROM (
    SELECT id_producto FROM public.catalogo_cotizacion_publico
      WHERE organizacion->>'id_organizacion'=org::text AND organizacion->'pais'->>'id_pais'=pais::text
        AND id_producto=producto.id_producto ORDER BY nombre,id_producto LIMIT 1
  ) filtrado;
  IF n<>1 THEN RAISE EXCEPTION 'El catálogo no devuelve el producto con filtros combinados'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  SET LOCAL ROLE authenticated;
  UPDATE public.productos SET publicado=false WHERE id_producto=producto.id_producto;
  RESET ROLE;
  SET LOCAL ROLE anon;
  IF EXISTS(SELECT 1 FROM public.catalogo_cotizacion_publico WHERE id_producto=producto.id_producto) THEN
    RAISE EXCEPTION 'Se publicó un producto deshabilitado'; END IF;
  RESET ROLE;
  INSERT INTO qa_scrum162_resultado VALUES(jsonb_build_object('resultado','PASS','datos_prueba','Se revierten al terminar',
    'verificado','Material y terminación independientes, conservación de datos, versión, publicación y filtros SQL. HTTP probado por separado.'));
END $qa$;
SELECT resultado FROM qa_scrum162_resultado;
ROLLBACK;
