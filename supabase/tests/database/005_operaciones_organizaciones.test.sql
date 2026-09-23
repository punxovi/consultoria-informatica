-- Verifica el CRUD requerido por KAN-159 sobre PostgreSQL local. Todo se revierte.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT lives_ok($q$
  INSERT INTO public.organizaciones (
    id_organizacion, id_pais, nombre, nombre_representante, telefono, correo,
    region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo,
    descripcion_breve, tipo_organizacion, numero_beneficiarios
  )
  SELECT
    '15900000-0000-4000-8000-000000000001', id_pais, 'Organización KAN-159',
    'Representante de prueba', '+56 9 0000 0000', 'kan159@example.invalid',
    'Región de prueba', 'Comuna de prueba', 'Dirección de prueba',
    'Comunidad de prueba', 'Registro temporal para prueba',
    'centro_comunitario', 25
  FROM public.paises
  WHERE codigo_iso = 'CL'
$q$, 'Se puede registrar una organización asociada a Chile');

SELECT is(
  (SELECT count(*) FROM public.organizaciones WHERE archived_at IS NULL AND nombre = 'Organización KAN-159'),
  1::bigint,
  'Se pueden consultar las organizaciones activas'
);

SELECT is(
  (SELECT nombre FROM public.organizaciones WHERE id_organizacion = '15900000-0000-4000-8000-000000000001'),
  'Organización KAN-159',
  'Se puede consultar una organización por ID'
);

SELECT is(
  (
    SELECT paises.codigo_iso
    FROM public.organizaciones
    JOIN public.paises USING (id_pais)
    WHERE id_organizacion = '15900000-0000-4000-8000-000000000001'
  ),
  'CL',
  'La organización conserva su relación con País'
);

SELECT lives_ok($q$
  UPDATE public.organizaciones
  SET nombre = 'Organización KAN-159 actualizada', numero_beneficiarios = 30
  WHERE id_organizacion = '15900000-0000-4000-8000-000000000001'
$q$, 'Se puede modificar una organización');

SELECT is(
  (SELECT version FROM public.organizaciones WHERE id_organizacion = '15900000-0000-4000-8000-000000000001'),
  2::bigint,
  'La modificación incrementa la versión para control de concurrencia'
);

SELECT throws_ok($q$
  INSERT INTO public.organizaciones (
    id_pais, nombre, nombre_representante, telefono, correo,
    region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo,
    descripcion_breve, tipo_organizacion, numero_beneficiarios
  ) VALUES (
    'ffffffff-ffff-ffff-ffff-ffffffffffff', 'País inexistente', 'Representante',
    '123', 'pais@example.invalid', 'Región', 'Comuna', 'Dirección', 'Público',
    'Descripción', 'centro_comunitario', 1
  )
$q$, '23503', NULL, 'No se admite una organización con un país inexistente');

SELECT throws_ok($q$
  UPDATE public.organizaciones
  SET nombre = '   '
  WHERE id_organizacion = '15900000-0000-4000-8000-000000000001'
$q$, '23514', NULL, 'No se admite un nombre vacío');

SELECT throws_ok($q$
  UPDATE public.organizaciones
  SET numero_beneficiarios = -1
  WHERE id_organizacion = '15900000-0000-4000-8000-000000000001'
$q$, '23514', NULL, 'No se admite un número de beneficiarios negativo');

SELECT throws_ok($q$
  UPDATE public.organizaciones
  SET tipo_organizacion = 'otra', tipo_organizacion_otro = NULL
  WHERE id_organizacion = '15900000-0000-4000-8000-000000000001'
$q$, '23514', NULL, 'El tipo otra exige especificar su descripción');

SELECT * FROM finish();
ROLLBACK;
