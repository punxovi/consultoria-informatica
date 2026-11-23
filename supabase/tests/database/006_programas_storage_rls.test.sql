BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email)
VALUES
  ('90000000-0000-4000-8000-000000000001','admin-programas@example.invalid'),
  ('90000000-0000-4000-8000-000000000002','coord-programas@example.invalid'),
  ('90000000-0000-4000-8000-000000000003','sin-rol-programas@example.invalid');

INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,otorgado_por)
SELECT '90000000-0000-4000-8000-000000000001', id_rol, 'global', '90000000-0000-4000-8000-000000000001'
FROM public.roles
WHERE codigo = 'ADMIN';

INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por)
SELECT '90000000-0000-4000-8000-000000000002', roles.id_rol, 'pais', paises.id_pais, '90000000-0000-4000-8000-000000000001'
FROM public.roles
CROSS JOIN public.paises
WHERE roles.codigo = 'COORD'
  AND paises.codigo_iso = 'CL';

SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'fge-archivos'),
  52428800::bigint,
  'Bucket admite respaldos documentales de hasta 50 MiB'
);

SELECT ok(
  (SELECT allowed_mime_types @> ARRAY['image/jpeg','image/png','image/webp'] FROM storage.buckets WHERE id = 'fge-archivos'),
  'Bucket acepta JPG, PNG y WebP como formatos de entrada'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000001', true);

SELECT lives_ok(
  $q$
    INSERT INTO public.programas(
      id_programa,
      nombre,
      descripcion,
      objetivo_general,
      objetivos_especificos,
      componentes_linea_accion,
      resultados_esperados
    )
    VALUES (
      '91000000-0000-4000-8000-000000000001',
      'Programa RLS Admin',
      'Prueba',
      'Prueba',
      'Prueba',
      'Prueba',
      'Prueba'
    )
  $q$,
  'Administrador puede crear Programas'
);

SELECT lives_ok(
  $q$
    UPDATE public.programas
    SET descripcion = 'Prueba actualizada'
    WHERE id_programa = '91000000-0000-4000-8000-000000000001'
  $q$,
  'Administrador puede modificar Programas'
);

SELECT lives_ok(
  $q$
    INSERT INTO public.archivos(
      id_programa,
      ruta_objeto,
      nombre_original,
      mime_type,
      tamano_bytes,
      categoria,
      estado_carga
    )
    VALUES (
      '91000000-0000-4000-8000-000000000001',
      'programas/91000000-0000-4000-8000-000000000001.webp',
      'programa.webp',
      'image/webp',
      512000,
      'imagen_programa',
      'disponible'
    )
  $q$,
  'Administrador puede asociar imagen WebP valida al Programa'
);

SELECT throws_ok(
  $q$
    INSERT INTO public.archivos(
      id_programa,
      ruta_objeto,
      nombre_original,
      mime_type,
      tamano_bytes,
      categoria,
      estado_carga
    )
    VALUES (
      '91000000-0000-4000-8000-000000000001',
      'programas/imagen-jpg.jpg',
      'programa.jpg',
      'image/jpeg',
      512000,
      'imagen_programa',
      'disponible'
    )
  $q$,
  '23514',
  NULL,
  'Metadatos finales de imagen de Programa exigen WebP'
);

RESET ROLE;

SELECT ok(
  EXISTS (
    SELECT 1 FROM fge_private.historial_cambios
    WHERE tabla_afectada = 'programas'
      AND tipo_accion = 'INSERT'
      AND id_usuario = '90000000-0000-4000-8000-000000000001'
      AND actor_sql = 'authenticated'
  ),
  'La creación autorizada conserva usuario y rol invocador en la auditoría'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'fge_private.historial_cambios', 'INSERT'),
  'El cliente no puede escribir directamente el historial privado'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'fge_private.auditar_registro()', 'EXECUTE'),
  'El cliente no puede ejecutar directamente el trigger de auditoría'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000002', true);

SELECT ok(
  (SELECT count(*) FROM public.programas) > 0,
  'Coordinador puede consultar Programas'
);

SELECT throws_ok(
  $q$
    INSERT INTO public.programas(
      nombre,
      descripcion,
      objetivo_general,
      objetivos_especificos,
      componentes_linea_accion,
      resultados_esperados
    )
    VALUES (
      'Programa no permitido',
      'Prueba',
      'Prueba',
      'Prueba',
      'Prueba',
      'Prueba'
    )
  $q$,
  '42501',
  NULL,
  'Coordinador no puede crear Programas'
);

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '90000000-0000-4000-8000-000000000003', true);

SELECT is(
  (SELECT count(*) FROM public.programas),
  0::bigint,
  'Usuario autenticado sin rol no consulta Programas'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
