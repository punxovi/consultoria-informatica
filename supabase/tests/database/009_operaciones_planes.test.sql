-- Astro Actions de Planes: relaciones, permisos, fechas y auditoría.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email) VALUES
  ('98000000-0000-4000-8000-000000000001','admin-planes@example.invalid'),
  ('98000000-0000-4000-8000-000000000002','coord-cl-planes@example.invalid'),
  ('98000000-0000-4000-8000-000000000003','coord-ar-planes@example.invalid'),
  ('98000000-0000-4000-8000-000000000004','invit-planes@example.invalid');

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
  '98100000-0000-4000-8000-000000000001',id_pais,'Organización Planes CL','Responsable',
  '+56 9 1234 5678','planes@example.invalid','Metropolitana','Santiago','Dirección 1',
  'Comunidad','Prueba de Planes','centro_comunitario',10
FROM public.paises WHERE codigo_iso='CL';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000001',true);

SELECT lives_ok($q$
  INSERT INTO public.planes(
    id_plan,id_organizacion,id_programa,nombre,situacion_necesidad,
    objetivo_general,objetivos_especificos,resultado_esperado,
    responsable_nombre,fecha_inicio,fecha_termino
  ) SELECT
    '98200000-0000-4000-8000-000000000001',
    '98100000-0000-4000-8000-000000000001',id_programa,'Plan ADMIN','Necesidad',
    'Objetivo','Objetivos','Resultado','Responsable','2026-01-01','2026-12-31'
  FROM public.programas WHERE archived_at IS NULL ORDER BY nombre LIMIT 1
$q$,'Administrador puede crear un Plan');

SELECT is((SELECT count(*) FROM public.planes WHERE id_plan='98200000-0000-4000-8000-000000000001'),1::bigint,'Plan puede listarse y consultarse');

SELECT throws_ok($q$
  UPDATE public.planes SET fecha_termino='2025-12-31'
  WHERE id_plan='98200000-0000-4000-8000-000000000001'
$q$,'23514',NULL,'Base rechaza fechas invertidas');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000002',true);
SELECT lives_ok($q$
  UPDATE public.planes SET nombre='Plan actualizado por Coordinador CL'
  WHERE id_plan='98200000-0000-4000-8000-000000000001'
$q$,'Coordinador del país puede actualizar el Plan');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000003',true);
SELECT lives_ok($q$
  UPDATE public.planes SET nombre='Cambio no permitido'
  WHERE id_plan='98200000-0000-4000-8000-000000000001'
$q$,'RLS procesa sin revelar el Plan de otro país');

RESET ROLE;
SELECT is((SELECT nombre FROM public.planes WHERE id_plan='98200000-0000-4000-8000-000000000001'),'Plan actualizado por Coordinador CL','Coordinador de otro país no modifica el Plan');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000004',true);
SELECT is((SELECT count(*) FROM public.planes WHERE id_plan='98200000-0000-4000-8000-000000000001'),1::bigint,'Invitado puede consultar Planes activos');
SELECT throws_ok($q$
  INSERT INTO public.planes(
    id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,
    objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino
  ) SELECT
    '98100000-0000-4000-8000-000000000001',id_programa,'Plan de Invitado',
    'Necesidad','Objetivo','Objetivos','Resultado','Responsable','2026-01-01','2026-12-31'
  FROM public.programas WHERE archived_at IS NULL ORDER BY nombre LIMIT 1
$q$,'42501',NULL,'Invitado no puede crear Planes');

RESET ROLE;
SELECT ok(EXISTS(
  SELECT 1 FROM fge_private.historial_cambios
  WHERE tabla_afectada='planes' AND id_usuario='98000000-0000-4000-8000-000000000002'
),'La actualización autorizada queda auditada');

SET LOCAL ROLE anon;
SELECT throws_ok($q$SELECT count(*) FROM public.planes$q$,'42501',NULL,'Anónimo no puede consultar Planes');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
