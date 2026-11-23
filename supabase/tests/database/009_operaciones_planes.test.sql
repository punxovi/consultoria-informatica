BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email) VALUES
  ('98000000-0000-4000-8000-000000000001','admin-planes@example.invalid'),
  ('98000000-0000-4000-8000-000000000002','coord-cl-planes@example.invalid'),
  ('98000000-0000-4000-8000-000000000003','coord-ar-planes@example.invalid'),
  ('98000000-0000-4000-8000-000000000004','invit-planes@example.invalid'),
  ('98000000-0000-4000-8000-000000000005','sin-rol-planes@example.invalid');

INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,otorgado_por)
SELECT '98000000-0000-4000-8000-000000000001', id_rol, 'global', '98000000-0000-4000-8000-000000000001'
FROM public.roles WHERE codigo='ADMIN';
INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por)
SELECT '98000000-0000-4000-8000-000000000002', rol.id_rol, 'pais', pais.id_pais, '98000000-0000-4000-8000-000000000001'
FROM public.roles rol CROSS JOIN public.paises pais WHERE rol.codigo='COORD' AND pais.codigo_iso='CL';
INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por)
SELECT '98000000-0000-4000-8000-000000000003', rol.id_rol, 'pais', pais.id_pais, '98000000-0000-4000-8000-000000000001'
FROM public.roles rol CROSS JOIN public.paises pais WHERE rol.codigo='COORD' AND pais.codigo_iso='AR';
INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,otorgado_por)
SELECT '98000000-0000-4000-8000-000000000004', id_rol, 'global', '98000000-0000-4000-8000-000000000001'
FROM public.roles WHERE codigo='INVIT';

INSERT INTO public.organizaciones(
  id_organizacion,id_pais,nombre,nombre_representante,telefono,correo,
  region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,
  descripcion_breve,tipo_organizacion,numero_beneficiarios
)
SELECT
  '98100000-0000-4000-8000-000000000001',id_pais,'Organizacion Planes CL','Responsable',
  '+56 9 1234 5678','planes@example.invalid','Metropolitana','Santiago','Direccion 1',
  'Comunidad','Prueba de Planes','centro_comunitario',10
FROM public.paises WHERE codigo_iso='CL';
INSERT INTO public.organizaciones(
  id_organizacion,id_pais,nombre,nombre_representante,telefono,correo,
  region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,
  descripcion_breve,tipo_organizacion,numero_beneficiarios
)
SELECT
  '98100000-0000-4000-8000-000000000002',id_pais,'Organizacion Planes AR','Responsable',
  '+54 11 1234 5678','planes-ar@example.invalid','Buenos Aires','La Plata','Direccion 2',
  'Comunidad','Prueba de Planes AR','centro_comunitario',20
FROM public.paises WHERE codigo_iso='AR';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);

SELECT lives_ok($q$
  INSERT INTO public.planes(periodo_anual,
    id_plan,id_organizacion,id_programa,nombre,situacion_necesidad,
    objetivo_general,objetivos_especificos,resultado_esperado,
    responsable_nombre,fecha_inicio,fecha_termino
  ) SELECT
    2026,'98200000-0000-4000-8000-000000000001',
    '98100000-0000-4000-8000-000000000001',id_programa,'Plan ADMIN','Necesidad',
    'Objetivo','Objetivos','Resultado','Responsable','2026-01-01','2026-12-31'
  FROM public.programas WHERE archived_at IS NULL ORDER BY nombre LIMIT 1
$q$,'Administrador puede crear un Plan');
SELECT lives_ok($q$
  INSERT INTO public.planes(periodo_anual,
    id_plan,id_organizacion,id_programa,nombre,situacion_necesidad,
    objetivo_general,objetivos_especificos,resultado_esperado,
    responsable_nombre,fecha_inicio,fecha_termino
  ) SELECT
    2026,'98200000-0000-4000-8000-000000000002',
    '98100000-0000-4000-8000-000000000002',id_programa,'Plan ADMIN AR','Necesidad',
    'Objetivo','Objetivos','Resultado','Responsable','2026-01-01','2026-12-31'
  FROM public.programas WHERE archived_at IS NULL ORDER BY nombre LIMIT 1
$q$,'Administrador puede crear un Plan en otro pais');

SELECT is((SELECT count(*) FROM public.planes WHERE id_plan='98200000-0000-4000-8000-000000000001'),1::bigint,'Plan puede listarse y consultarse');

SELECT is((SELECT periodo_anual FROM public.planes WHERE id_plan='98200000-0000-4000-8000-000000000001'),2026::smallint,'Plan conserva año explícito');
SELECT throws_ok($q$UPDATE public.planes SET periodo_anual=NULL WHERE id_plan='98200000-0000-4000-8000-000000000001'$q$,'23502',NULL,'Plan exige período anual');
SELECT throws_ok($q$UPDATE public.planes SET periodo_anual=0 WHERE id_plan='98200000-0000-4000-8000-000000000001'$q$,'23514',NULL,'Plan rechaza año inválido');
WITH cambio AS (UPDATE public.planes SET periodo_anual=2027 WHERE id_plan='98200000-0000-4000-8000-000000000001' AND version=1 RETURNING id_plan) SELECT is((SELECT count(*) FROM cambio),1::bigint,'Edición con versión vigente persiste');
WITH cambio AS (UPDATE public.planes SET periodo_anual=2028 WHERE id_plan='98200000-0000-4000-8000-000000000001' AND version=1 RETURNING id_plan) SELECT is((SELECT count(*) FROM cambio),0::bigint,'Edición con versión antigua no sobrescribe');
SELECT is((SELECT periodo_anual FROM public.planes WHERE id_plan='98200000-0000-4000-8000-000000000001'),2027::smallint,'Año editado puede consultarse después');
SELECT is((SELECT org.nombre FROM public.planes plan JOIN public.organizaciones org USING(id_organizacion) WHERE plan.id_plan='98200000-0000-4000-8000-000000000001'),'Organizacion Planes CL','Consulta incluye la Organización relacionada');
SELECT throws_ok($q$SELECT telefono FROM public.organizaciones$q$,'42501',NULL,'Consulta de Planes no abre campos ajenos de Organización');

SELECT throws_ok($q$
  UPDATE public.planes SET fecha_termino='2025-12-31'
  WHERE id_plan='98200000-0000-4000-8000-000000000001'
$q$,'23514',NULL,'Base rechaza fechas invertidas');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000002',true);
SELECT is((SELECT count(*) FROM public.planes),2::bigint,'Coordinador puede consultar Planes activos de todos los paises');
SELECT lives_ok($q$
  UPDATE public.planes SET nombre='Plan actualizado por Coordinador CL'
  WHERE id_plan='98200000-0000-4000-8000-000000000001'
$q$,'Coordinador del pais puede actualizar el Plan');
SELECT lives_ok($q$
  UPDATE public.planes SET nombre='Cambio AR no permitido por Coordinador CL'
  WHERE id_plan='98200000-0000-4000-8000-000000000002'
$q$,'RLS oculta la escritura de Planes fuera del alcance territorial');

RESET ROLE;
SELECT is((SELECT nombre FROM public.planes WHERE id_plan='98200000-0000-4000-8000-000000000002'),'Plan ADMIN AR','Coordinador sin cobertura no modifica Planes de otro pais');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000003',true);
SELECT lives_ok($q$
  UPDATE public.planes SET nombre='Cambio no permitido'
  WHERE id_plan='98200000-0000-4000-8000-000000000001'
$q$,'RLS procesa sin revelar el Plan de otro pais');

RESET ROLE;
SELECT is((SELECT nombre FROM public.planes WHERE id_plan='98200000-0000-4000-8000-000000000001'),'Plan actualizado por Coordinador CL','Coordinador de otro pais no modifica el Plan');

INSERT INTO public.permisos_temporales(
  id_usuario_beneficiario,id_usuario_otorga,id_pais,inicio_at,fin_at,motivo
)
SELECT
  '98000000-0000-4000-8000-000000000003',
  '98000000-0000-4000-8000-000000000001',
  id_pais,
  now() - interval '1 hour',
  now() + interval '1 day',
  'Cobertura de prueba para Planes'
FROM public.paises WHERE codigo_iso='CL';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000003',true);
SELECT lives_ok($q$
  UPDATE public.planes SET nombre='Plan actualizado por cobertura temporal'
  WHERE id_plan='98200000-0000-4000-8000-000000000001'
$q$,'Coordinador con cobertura temporal vigente puede actualizar el Plan');

RESET ROLE;
SELECT is((SELECT nombre FROM public.planes WHERE id_plan='98200000-0000-4000-8000-000000000001'),'Plan actualizado por cobertura temporal','La cobertura temporal habilita la escritura territorial');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000004',true);
SELECT is((SELECT count(*) FROM public.planes WHERE id_plan='98200000-0000-4000-8000-000000000001'),1::bigint,'Invitado puede consultar Planes activos');
SELECT throws_ok($q$
  INSERT INTO public.planes(periodo_anual,
    id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,
    objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino
  ) SELECT
    2026,'98100000-0000-4000-8000-000000000001',id_programa,'Plan de Invitado',
    'Necesidad','Objetivo','Objetivos','Resultado','Responsable','2026-01-01','2026-12-31'
  FROM public.programas WHERE archived_at IS NULL ORDER BY nombre LIMIT 1
$q$,'42501',NULL,'Invitado no puede crear Planes');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000005',true);
SELECT is((SELECT count(*) FROM public.planes),0::bigint,'Usuario autenticado sin rol no consulta Planes');
SELECT lives_ok($q$
  INSERT INTO public.planes(periodo_anual,
    id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,
    objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino
  ) SELECT
    2026,'98100000-0000-4000-8000-000000000001',id_programa,'Plan sin rol',
    'Necesidad','Objetivo','Objetivos','Resultado','Responsable','2026-01-01','2026-12-31'
  FROM public.programas WHERE archived_at IS NULL ORDER BY nombre LIMIT 1
$q$,'Usuario autenticado sin rol no puede crear Planes');

RESET ROLE;
SELECT is((SELECT count(*) FROM public.planes WHERE nombre='Plan sin rol'),0::bigint,'El intento sin rol no inserta registros');
SELECT ok(EXISTS(
  SELECT 1 FROM fge_private.historial_cambios
  WHERE tabla_afectada='planes' AND id_usuario='98000000-0000-4000-8000-000000000002'
),'La actualizacion autorizada queda auditada');

SET LOCAL ROLE anon;
SELECT throws_ok($q$SELECT count(*) FROM public.planes$q$,'42501',NULL,'Anonimo no puede consultar Planes');
RESET ROLE;

SELECT ok(EXISTS(SELECT 1 FROM fge_private.historial_cambios WHERE tabla_afectada='planes' AND id_usuario='98000000-0000-4000-8000-000000000002' AND codigo_rol='COORD' AND id_pais=(SELECT id_pais FROM public.paises WHERE codigo_iso='CL') AND id_asignacion IS NOT NULL),'Auditoría conserva rol y país ejercidos');
SELECT * FROM finish();
ROLLBACK;
