-- SCRUM-89: operaciones, restricciones y permisos de Acciones.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email) VALUES
  ('99000000-0000-4000-8000-000000000001','admin-acciones@example.invalid'),
  ('99000000-0000-4000-8000-000000000002','coord-cl-acciones@example.invalid'),
  ('99000000-0000-4000-8000-000000000003','invit-acciones@example.invalid');

INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,otorgado_por)
SELECT '99000000-0000-4000-8000-000000000001',id_rol,'global','99000000-0000-4000-8000-000000000001'
FROM public.roles WHERE codigo='ADMIN';
INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por)
SELECT '99000000-0000-4000-8000-000000000002',rol.id_rol,'pais',pais.id_pais,'99000000-0000-4000-8000-000000000001'
FROM public.roles rol CROSS JOIN public.paises pais WHERE rol.codigo='COORD' AND pais.codigo_iso='CL';
INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,otorgado_por)
SELECT '99000000-0000-4000-8000-000000000003',id_rol,'global','99000000-0000-4000-8000-000000000001'
FROM public.roles WHERE codigo='INVIT';

INSERT INTO public.organizaciones(
  id_organizacion,id_pais,nombre,nombre_representante,telefono,correo,
  region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,
  descripcion_breve,tipo_organizacion,numero_beneficiarios
)
SELECT '99100000-0000-4000-8000-000000000001',id_pais,'Organización Acciones CL','Responsable',
  '+56 9 1234 5678','acciones@example.invalid','Metropolitana','Santiago','Dirección 1',
  'Comunidad','Prueba de Acciones','centro_comunitario',10
FROM public.paises WHERE codigo_iso='CL';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000001',true);

INSERT INTO public.planes(
  id_plan,id_organizacion,id_programa,nombre,situacion_necesidad,
  objetivo_general,objetivos_especificos,resultado_esperado,
  responsable_nombre,fecha_inicio,fecha_termino
)
SELECT '99200000-0000-4000-8000-000000000001','99100000-0000-4000-8000-000000000001',
  id_programa,'Plan para Acciones','Necesidad','Objetivo','Objetivos','Resultado',
  'Responsable','2026-01-01','2026-12-31'
FROM public.programas WHERE archived_at IS NULL ORDER BY nombre LIMIT 1;

SELECT lives_ok($q$
  INSERT INTO public.acciones(
    id_accion,id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino,
    estado,resultado_esperado
  ) VALUES (
    '99300000-0000-4000-8000-000000000001','99200000-0000-4000-8000-000000000001',
    'Taller comunitario','Responsable','2026-02-01','2026-03-01','no_iniciada','Participantes capacitados'
  )
$q$,'Administrador puede crear una Acción para un Plan válido');

SELECT is((SELECT count(*) FROM public.acciones WHERE id_plan='99200000-0000-4000-8000-000000000001'),1::bigint,'La Acción puede listarse por Plan');
SELECT is((SELECT nombre FROM public.acciones WHERE id_accion='99300000-0000-4000-8000-000000000001'),'Taller comunitario','La Acción puede consultarse por ID');
SELECT throws_ok($q$
  UPDATE public.acciones SET fecha_termino='2025-01-01'
  WHERE id_accion='99300000-0000-4000-8000-000000000001'
$q$,'23514',NULL,'Base rechaza fechas invertidas');
SELECT throws_ok($q$
  UPDATE public.acciones SET estado='cancelada',observacion_motivo=NULL
  WHERE id_accion='99300000-0000-4000-8000-000000000001'
$q$,'23514',NULL,'Acción cancelada exige un motivo');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000002',true);
SELECT lives_ok($q$
  UPDATE public.acciones SET estado='en_desarrollo'
  WHERE id_accion='99300000-0000-4000-8000-000000000001'
$q$,'Coordinador autorizado puede actualizar una Acción');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','99000000-0000-4000-8000-000000000003',true);
SELECT is((SELECT count(*) FROM public.acciones WHERE id_accion='99300000-0000-4000-8000-000000000001'),1::bigint,'Invitado puede consultar Acciones activas');
SELECT throws_ok($q$
  INSERT INTO public.acciones(id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino)
  VALUES ('99200000-0000-4000-8000-000000000001','No permitida','Invitado','2026-01-01','2026-01-02')
$q$,'42501',NULL,'Invitado no puede crear Acciones');

RESET ROLE;
SELECT ok(EXISTS(
  SELECT 1 FROM fge_private.historial_cambios
  WHERE tabla_afectada='acciones' AND id_usuario='99000000-0000-4000-8000-000000000002'
),'La actualización de Acción queda auditada');

SET LOCAL ROLE anon;
SELECT throws_ok($q$SELECT count(*) FROM public.acciones$q$,'42501',NULL,'Anónimo no puede consultar Acciones');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
