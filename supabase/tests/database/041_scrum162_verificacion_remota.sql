-- SQL Editor, después de la migración 20261103160000_fge_scrum162_operaciones_productos.sql.
-- Usa una identidad ADMIN existente como contexto SQL, sin contraseñas ni JWT.
-- No sustituye una prueba de inicio de sesión HTTP. Todos los cambios se revierten.
BEGIN;
CREATE TEMP TABLE scrum162_verificacion(resultado jsonb) ON COMMIT DROP;
DO $$
DECLARE administrador uuid; organizacion uuid; producto jsonb; consulta jsonb;
BEGIN
  SELECT a.id_usuario INTO administrador FROM public.asignaciones_roles a
    JOIN public.roles r ON r.id_rol=a.id_rol AND r.codigo='ADMIN' AND r.activo AND r.archived_at IS NULL
    JOIN public.perfiles p ON p.id_usuario=a.id_usuario AND p.activo AND p.archived_at IS NULL
    WHERE a.revocado_at IS NULL AND a.archived_at IS NULL ORDER BY a.id_usuario LIMIT 1;
  IF administrador IS NULL THEN RAISE EXCEPTION 'Se requiere un ADMIN activo existente'; END IF;
  SELECT o.id_organizacion INTO organizacion FROM public.organizaciones o
    JOIN public.paises p ON p.id_pais=o.id_pais WHERE o.archived_at IS NULL AND p.archived_at IS NULL
    ORDER BY o.id_organizacion LIMIT 1;
  IF organizacion IS NULL THEN RAISE EXCEPTION 'Se requiere una Organización activa existente'; END IF;
  PERFORM set_config('request.jwt.claim.sub',administrador::text,true);
  producto := public.administrar_productos_cotizacion('create',jsonb_build_object(
    'id_organizacion',organizacion,'nombre','QA SCRUM-162','descripcion','Producto sintético de prueba','unidad_medida','unidad'));
  IF (producto->>'publicado')::boolean THEN RAISE EXCEPTION 'El alta debe comenzar sin publicar'; END IF;
  producto := public.administrar_productos_cotizacion('update',jsonb_build_object('id_producto',producto->>'id_producto',
    'version_esperada',(producto->>'version')::bigint,'cambios',jsonb_build_object('material_terminacion','Tela reciclada')));
  producto := public.administrar_productos_cotizacion('activate',jsonb_build_object('id_producto',producto->>'id_producto','version_esperada',(producto->>'version')::bigint));
  consulta := public.consultar_productos_publicos('get',jsonb_build_object('id_producto',producto->>'id_producto'));
  IF consulta->>'material_terminacion'<>'Tela reciclada' OR consulta ?| ARRAY['created_by','updated_by','version','archived_at']
    OR (consulta->'organizacion') ?| ARRAY['correo','telefono','direccion','nombre_representante'] THEN
    RAISE EXCEPTION 'La proyección pública no cumple el contrato'; END IF;
  consulta := public.consultar_productos_publicos('list',jsonb_build_object('id_organizacion',organizacion));
  IF jsonb_typeof(consulta->'products')<>'array' THEN RAISE EXCEPTION 'Falló el listado por Organización'; END IF;
  producto := public.administrar_productos_cotizacion('deactivate',jsonb_build_object('id_producto',producto->>'id_producto','version_esperada',(producto->>'version')::bigint));
  BEGIN
    PERFORM public.consultar_productos_publicos('get',jsonb_build_object('id_producto',producto->>'id_producto'));
    RAISE EXCEPTION 'Un producto desactivado no debe ser público';
  EXCEPTION WHEN SQLSTATE 'P0162' THEN NULL;
  END;
  PERFORM set_config('request.jwt.claim.sub','16200000-0000-4000-8000-000000000099',true);
  BEGIN
    PERFORM public.administrar_productos_cotizacion('list','{}');
    RAISE EXCEPTION 'Se permitió administrar sin ADMIN';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO scrum162_verificacion VALUES(jsonb_build_object('resultado','OK','alta_y_edicion',true,
    'activacion_y_desactivacion',true,'proyeccion_publica_sin_contactos',true,'solo_admin',true,
    'datos_prueba','se revierten al terminar'));
END $$;
SELECT resultado FROM scrum162_verificacion;
ROLLBACK;
