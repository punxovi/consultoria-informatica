BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT hasnt_column('public', 'programas', 'id_organizacion',
  'Programa es un catálogo global, sin organización directa');
SELECT fk_ok('public', 'planes', 'id_programa', 'public', 'programas', 'id_programa',
  'Plan referencia el Programa institucional');

INSERT INTO auth.users (id, email) VALUES
  ('97200000-0000-4000-8000-000000000001', 'admin-kan172@example.invalid'),
  ('97200000-0000-4000-8000-000000000002', 'coord-kan172@example.invalid');

INSERT INTO public.asignaciones_roles (id_usuario, id_rol, alcance, otorgado_por)
SELECT '97200000-0000-4000-8000-000000000001', id_rol, 'global',
  '97200000-0000-4000-8000-000000000001'
FROM public.roles WHERE codigo = 'ADMIN';

INSERT INTO public.asignaciones_roles (id_usuario, id_rol, alcance, id_pais, otorgado_por)
SELECT '97200000-0000-4000-8000-000000000002', rol.id_rol, 'pais', pais.id_pais,
  '97200000-0000-4000-8000-000000000001'
FROM public.roles AS rol CROSS JOIN public.paises AS pais
WHERE rol.codigo = 'COORD' AND pais.codigo_iso = 'CL';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97200000-0000-4000-8000-000000000001', true);

SELECT lives_ok($q$
  INSERT INTO public.programas (
    id_programa, nombre, descripcion, objetivo_general, objetivos_especificos,
    componentes_linea_accion, resultados_esperados
  ) VALUES (
    '17200000-0000-4000-8000-000000000001', 'Programa KAN-172',
    'Descripción', 'Objetivo general', 'Objetivos específicos',
    'Componentes existentes', 'Resultados existentes'
  )
$q$, 'Administrador puede registrar un Programa sin Organización');

SELECT is(
  (SELECT count(*) FROM public.programas
   WHERE archived_at IS NULL AND nombre = 'Programa KAN-172'),
  1::bigint, 'Se pueden listar Programas activos'
);
SELECT is(
  (SELECT nombre FROM public.programas
   WHERE id_programa = '17200000-0000-4000-8000-000000000001'),
  'Programa KAN-172', 'Se puede consultar un Programa por ID'
);

SELECT lives_ok($q$
  UPDATE public.programas
  SET descripcion = 'Descripción actualizada'
  WHERE id_programa = '17200000-0000-4000-8000-000000000001'
$q$, 'Administrador puede modificar un Programa');
SELECT is(
  (SELECT version FROM public.programas
   WHERE id_programa = '17200000-0000-4000-8000-000000000001'),
  2::bigint, 'La actualización incrementa la versión'
);
SELECT throws_ok($q$
  UPDATE public.programas SET nombre = '   '
  WHERE id_programa = '17200000-0000-4000-8000-000000000001'
$q$, '23514', NULL, 'No se admite un nombre vacío');

RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM fge_private.historial_cambios
    WHERE tabla_afectada = 'programas'
      AND tipo_accion = 'UPDATE'
      AND id_usuario = '97200000-0000-4000-8000-000000000001'
  ), 'La modificación queda auditada'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97200000-0000-4000-8000-000000000002', true);
SELECT is(
  (SELECT count(*) FROM public.programas
   WHERE id_programa = '17200000-0000-4000-8000-000000000001'),
  1::bigint, 'Coordinador puede consultar el catálogo transversal'
);
SELECT throws_ok($q$
  INSERT INTO public.programas (
    nombre, descripcion, objetivo_general, objetivos_especificos,
    componentes_linea_accion, resultados_esperados
  ) VALUES ('No permitido', 'Prueba', 'Prueba', 'Prueba', 'Prueba', 'Prueba')
$q$, '42501', NULL, 'Coordinador no puede registrar Programas');
SELECT lives_ok($q$
  UPDATE public.programas SET descripcion = 'Cambio no permitido'
  WHERE id_programa = '17200000-0000-4000-8000-000000000001'
$q$, 'RLS impide editar sin afectar otras consultas');

RESET ROLE;
SELECT is(
  (SELECT descripcion FROM public.programas
   WHERE id_programa = '17200000-0000-4000-8000-000000000001'),
  'Descripción actualizada', 'La edición del Coordinador no cambió los datos'
);

SELECT * FROM finish();
ROLLBACK;
