-- KAN-173. Se ejecuta en Supabase local y revierte todos los datos de prueba.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT has_table('public', 'programa_lineas_accion', 'Las líneas tienen tabla propia');
SELECT has_column('public', 'programa_lineas_accion', 'resultado_esperado', 'Cada línea tiene resultado esperado');

INSERT INTO public.programas (
  id_programa, nombre, descripcion, objetivo_general, objetivos_especificos,
  componentes_linea_accion, resultados_esperados
) VALUES (
  '17300000-0000-4000-8000-000000000001', 'Programa KAN-173', 'Prueba',
  'Prueba', 'Prueba', 'Texto legado de líneas', 'Texto legado de resultados'
);

INSERT INTO auth.users (id, email) VALUES
  ('97300000-0000-4000-8000-000000000001', 'admin-lineas@example.invalid'),
  ('97300000-0000-4000-8000-000000000002', 'coord-lineas@example.invalid'),
  ('97300000-0000-4000-8000-000000000003', 'sin-rol-lineas@example.invalid');

INSERT INTO public.asignaciones_roles (id_usuario, id_rol, alcance, otorgado_por)
SELECT '97300000-0000-4000-8000-000000000001', id_rol, 'global',
  '97300000-0000-4000-8000-000000000001'
FROM public.roles WHERE codigo = 'ADMIN';

INSERT INTO public.asignaciones_roles (id_usuario, id_rol, alcance, id_pais, otorgado_por)
SELECT '97300000-0000-4000-8000-000000000002', rol.id_rol, 'pais', pais.id_pais,
  '97300000-0000-4000-8000-000000000001'
FROM public.roles AS rol CROSS JOIN public.paises AS pais
WHERE rol.codigo = 'COORD' AND pais.codigo_iso = 'CL';

SELECT ok(
  NOT has_table_privilege('anon', 'public.programa_lineas_accion', 'SELECT'),
  'Anon no tiene acceso directo a líneas de acción'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.programa_lineas_accion', 'DELETE'),
  'El cliente no puede borrar físicamente líneas de acción'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000001', true);

SELECT lives_ok($q$
  INSERT INTO public.programa_lineas_accion (
    id_linea_accion, id_programa, linea_accion, resultado_esperado
  ) VALUES (
    '17310000-0000-4000-8000-000000000001',
    '17300000-0000-4000-8000-000000000001',
    'Capacitación', 'Equipo capacitado'
  ), (
    '17310000-0000-4000-8000-000000000002',
    '17300000-0000-4000-8000-000000000001',
    'Infraestructura', 'Espacio mejorado'
  )
$q$, 'Administrador puede crear varias líneas con resultados propios');

SELECT is(
  (SELECT count(*) FROM public.programa_lineas_accion
   WHERE id_programa = '17300000-0000-4000-8000-000000000001'),
  2::bigint, 'Se consultan las líneas de un Programa'
);
SELECT is(
  (SELECT resultado_esperado FROM public.programa_lineas_accion
   WHERE id_linea_accion = '17310000-0000-4000-8000-000000000001'),
  'Equipo capacitado', 'El resultado esperado corresponde a su línea'
);

SELECT lives_ok($q$
  UPDATE public.programa_lineas_accion
  SET resultado_esperado = 'Equipo capacitado y certificado'
  WHERE id_linea_accion = '17310000-0000-4000-8000-000000000001'
$q$, 'Administrador puede modificar una línea');
SELECT is(
  (SELECT version FROM public.programa_lineas_accion
   WHERE id_linea_accion = '17310000-0000-4000-8000-000000000001'),
  2::bigint, 'La edición incrementa la versión auditada'
);

SELECT throws_ok($q$
  INSERT INTO public.programa_lineas_accion (id_programa, linea_accion, resultado_esperado)
  VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Sin programa', 'Resultado')
$q$, '23503', NULL, 'No se admite un Programa inexistente');
SELECT throws_ok($q$
  INSERT INTO public.programa_lineas_accion (id_programa, linea_accion, resultado_esperado)
  VALUES ('17300000-0000-4000-8000-000000000001', '   ', 'Resultado')
$q$, '23514', NULL, 'La línea no puede quedar vacía');
SELECT throws_ok($q$
  INSERT INTO public.programa_lineas_accion (id_programa, linea_accion, resultado_esperado)
  VALUES ('17300000-0000-4000-8000-000000000001', 'Otra', '   ')
$q$, '23514', NULL, 'El resultado esperado no puede quedar vacío');
SELECT throws_ok($q$
  INSERT INTO public.programa_lineas_accion (id_programa, linea_accion, resultado_esperado)
  VALUES ('17300000-0000-4000-8000-000000000001', ' CAPACITACIÓN ', 'Duplicado')
$q$, '23505', NULL, 'No se duplica una línea activa dentro del Programa');

RESET ROLE;
SELECT ok(
  EXISTS (
    SELECT 1 FROM fge_private.historial_cambios
    WHERE tabla_afectada = 'programa_lineas_accion'
      AND tipo_accion = 'UPDATE'
      AND id_usuario = '97300000-0000-4000-8000-000000000001'
  ), 'Se audita la edición con el administrador responsable'
);
SELECT is(
  (SELECT componentes_linea_accion FROM public.programas
   WHERE id_programa = '17300000-0000-4000-8000-000000000001'),
  'Texto legado de líneas', 'Los textos anteriores de Programa se conservan'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000002', true);
SELECT is(
  (SELECT count(*) FROM public.programa_lineas_accion
   WHERE id_programa = '17300000-0000-4000-8000-000000000001'),
  2::bigint, 'Coordinador puede consultar las líneas'
);
SELECT throws_ok($q$
  INSERT INTO public.programa_lineas_accion (id_programa, linea_accion, resultado_esperado)
  VALUES ('17300000-0000-4000-8000-000000000001', 'Sin permiso', 'No aplica')
$q$, '42501', NULL, 'Coordinador no puede crear líneas');
SELECT lives_ok($q$
  UPDATE public.programa_lineas_accion SET resultado_esperado = 'Alterado'
  WHERE id_linea_accion = '17310000-0000-4000-8000-000000000001'
$q$, 'La política bloquea la actualización no autorizada sin error SQL');

RESET ROLE;
SELECT is(
  (SELECT resultado_esperado FROM public.programa_lineas_accion
   WHERE id_linea_accion = '17310000-0000-4000-8000-000000000001'),
  'Equipo capacitado y certificado', 'Coordinador no modificó la línea'
);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '97300000-0000-4000-8000-000000000003', true);
SELECT is(
  (SELECT count(*) FROM public.programa_lineas_accion),
  0::bigint, 'Usuario sin rol no consulta líneas'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
