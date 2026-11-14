-- Verifica consulta transversal de COORD y escritura restringida por territorio.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO auth.users(id, email) VALUES
  ('26000000-0000-4000-8000-000000000001', 'scrum-coord-admin@example.invalid'),
  ('26000000-0000-4000-8000-000000000002', 'scrum-coord-cl@example.invalid');

INSERT INTO public.asignaciones_roles(id_usuario, id_rol, alcance, id_pais, otorgado_por)
SELECT '26000000-0000-4000-8000-000000000001', id_rol, 'global', NULL,
  '26000000-0000-4000-8000-000000000001'
FROM public.roles WHERE codigo = 'ADMIN';
INSERT INTO public.asignaciones_roles(id_usuario, id_rol, alcance, id_pais, otorgado_por)
SELECT '26000000-0000-4000-8000-000000000002', r.id_rol, 'pais', p.id_pais,
  '26000000-0000-4000-8000-000000000001'
FROM public.roles r CROSS JOIN public.paises p
WHERE r.codigo = 'COORD' AND p.codigo_iso = 'CL';

INSERT INTO public.organizaciones(
  id_organizacion, id_pais, nombre, nombre_representante, telefono, correo,
  region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo,
  descripcion_breve, tipo_organizacion, numero_beneficiarios
)
SELECT '26100000-0000-4000-8000-000000000001', p.id_pais, 'Org consulta CL',
  'Representante', '123', 'consulta-cl@example.invalid', 'Región', 'Ciudad',
  'Dirección', 'Comunidad', 'Prueba', 'centro_comunitario', 1
FROM public.paises p WHERE p.codigo_iso = 'CL';
INSERT INTO public.organizaciones(
  id_organizacion, id_pais, nombre, nombre_representante, telefono, correo,
  region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo,
  descripcion_breve, tipo_organizacion, numero_beneficiarios
)
SELECT '26100000-0000-4000-8000-000000000002', p.id_pais, 'Org consulta AR',
  'Representante', '123', 'consulta-ar@example.invalid', 'Región', 'Ciudad',
  'Dirección', 'Comunidad', 'Prueba', 'centro_comunitario', 1
FROM public.paises p WHERE p.codigo_iso = 'AR';
INSERT INTO public.organizaciones(
  id_organizacion, id_pais, nombre, nombre_representante, telefono, correo,
  region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo,
  descripcion_breve, tipo_organizacion, numero_beneficiarios
)
SELECT '26100000-0000-4000-8000-000000000003', p.id_pais, 'Org consulta UY',
  'Representante', '123', 'consulta-uy@example.invalid', 'Región', 'Ciudad',
  'Dirección', 'Comunidad', 'Prueba', 'centro_comunitario', 1
FROM public.paises p WHERE p.codigo_iso = 'UY';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '26000000-0000-4000-8000-000000000002', true);

SELECT is(
  (SELECT count(*) FROM public.organizaciones
   WHERE id_organizacion IN (
     '26100000-0000-4000-8000-000000000001',
     '26100000-0000-4000-8000-000000000002',
     '26100000-0000-4000-8000-000000000003')),
  3::bigint,
  'Coordinador consulta Organizaciones de Chile, Argentina y Uruguay'
);
SELECT is(
  (SELECT nombre FROM public.organizaciones
   WHERE id_organizacion = '26100000-0000-4000-8000-000000000002'),
  'Org consulta AR',
  'Coordinador puede visualizar el detalle de una Organización de otro país'
);

SELECT throws_ok($q$
  INSERT INTO public.organizaciones(
    id_pais, nombre, nombre_representante, telefono, correo,
    region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo,
    descripcion_breve, tipo_organizacion, numero_beneficiarios
  ) SELECT p.id_pais, 'Org no autorizada', 'Representante', '123',
    'no-autorizada@example.invalid', 'Región', 'Ciudad', 'Dirección',
    'Comunidad', 'Prueba', 'centro_comunitario', 1
  FROM public.paises p WHERE p.codigo_iso = 'AR'
 $q$, '42501', NULL,
  'Coordinador sin cobertura no puede crear una Organización de otro país'
);

SELECT lives_ok($q$
  UPDATE public.organizaciones
  SET nombre = 'Org AR modificada sin autorización'
  WHERE id_organizacion = '26100000-0000-4000-8000-000000000002'
 $q$, 'La solicitud directa de edición de otro país no expone la Organización');
RESET ROLE;
SELECT is(
  (SELECT nombre FROM public.organizaciones
   WHERE id_organizacion = '26100000-0000-4000-8000-000000000002'),
  'Org consulta AR',
  'La edición de Organización de otro país no modifica datos'
);

SELECT * FROM finish();
ROLLBACK;
