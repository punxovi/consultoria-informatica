BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id,email) VALUES
  ('15300000-0000-4000-8000-000000000001','scrum153-admin@example.invalid'),
  ('15300000-0000-4000-8000-000000000002','scrum153-coord@example.invalid');

INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por)
SELECT '15300000-0000-4000-8000-000000000001', id_rol, 'global', NULL,
  '15300000-0000-4000-8000-000000000001'
FROM public.roles WHERE codigo='ADMIN';
INSERT INTO public.asignaciones_roles(id_usuario,id_rol,alcance,id_pais,otorgado_por)
SELECT '15300000-0000-4000-8000-000000000002', r.id_rol, 'pais', p.id_pais,
  '15300000-0000-4000-8000-000000000001'
FROM public.roles r CROSS JOIN public.paises p
WHERE r.codigo='COORD' AND p.codigo_iso='CL';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','15300000-0000-4000-8000-000000000002',true);

SELECT ok(NOT fge_private.usuario_tiene_cobertura_pais(
  (SELECT id_pais FROM public.paises WHERE codigo_iso='AR')),
  'La autorización no existe antes de la cobertura');

RESET ROLE;
INSERT INTO public.permisos_temporales(
  id_usuario_beneficiario,id_usuario_otorga,id_pais,inicio_at,fin_at,motivo
)
SELECT '15300000-0000-4000-8000-000000000002',
  '15300000-0000-4000-8000-000000000001', id_pais,
  '2099-01-01 00:00:00+00', '2099-01-31 00:00:00+00',
  'Cobertura SCRUM-153'
FROM public.paises WHERE codigo_iso='AR';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','15300000-0000-4000-8000-000000000002',true);
SELECT ok(NOT fge_private.usuario_tiene_cobertura_pais(
  (SELECT id_pais FROM public.paises WHERE codigo_iso='AR')),
  'Una cobertura no iniciada no concede permisos');

RESET ROLE;
UPDATE public.permisos_temporales
SET inicio_at=now() - interval '2 days',
    fin_at=((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date
      AT TIME ZONE 'America/Argentina/Buenos_Aires')
WHERE id_usuario_beneficiario='15300000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','15300000-0000-4000-8000-000000000002',true);
SELECT ok(fge_private.usuario_tiene_cobertura_pais(
  (SELECT id_pais FROM public.paises WHERE codigo_iso='AR')),
  'La cobertura mantiene permiso durante todo el día local de término');

RESET ROLE;
UPDATE public.permisos_temporales
SET fin_at=(((now() AT TIME ZONE 'America/Argentina/Buenos_Aires')::date - 1)
      AT TIME ZONE 'America/Argentina/Buenos_Aires')
WHERE id_usuario_beneficiario='15300000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','15300000-0000-4000-8000-000000000002',true);
SELECT ok(NOT fge_private.usuario_tiene_cobertura_pais(
  (SELECT id_pais FROM public.paises WHERE codigo_iso='AR')),
  'Una cobertura vencida no concede permisos');

RESET ROLE;
UPDATE public.permisos_temporales
SET inicio_at=now() - interval '1 day', fin_at=now() + interval '1 day'
WHERE id_usuario_beneficiario='15300000-0000-4000-8000-000000000002';
UPDATE public.permisos_temporales SET revocado_at=now(), revocado_por=
  '15300000-0000-4000-8000-000000000001', motivo_revocacion='Prueba'
WHERE id_usuario_beneficiario='15300000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','15300000-0000-4000-8000-000000000002',true);
SELECT ok(NOT fge_private.usuario_tiene_cobertura_pais(
  (SELECT id_pais FROM public.paises WHERE codigo_iso='AR')),
  'Una cobertura revocada no concede permisos');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
