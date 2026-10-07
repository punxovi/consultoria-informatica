-- Verifica directamente en PostgreSQL el expediente legal de Organizaciones. Todo se revierte.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT has_table('public', 'informacion_legal', 'Existe la estructura principal del expediente legal');
SELECT has_table('public', 'documentos_informacion_legal', 'Existe la estructura de documentos legales');
SELECT has_column('public', 'informacion_legal', 'created_by', 'El expediente posee autor de creación');
SELECT has_column('public', 'informacion_legal', 'updated_by', 'El expediente posee autor de actualización');
SELECT has_column('public', 'informacion_legal', 'version', 'El expediente posee control de versión');
SELECT fk_ok(
  'public', 'informacion_legal', 'id_organizacion',
  'public', 'organizaciones', 'id_organizacion',
  'El expediente referencia a Organizaciones'
);
SELECT fk_ok(
  'public', 'documentos_informacion_legal', 'id_informacion_legal',
  'public', 'informacion_legal', 'id_informacion_legal',
  'Los documentos referencian al expediente'
);

INSERT INTO public.organizaciones (
  id_organizacion, id_pais, nombre, nombre_representante, telefono, correo,
  region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo,
  descripcion_breve, tipo_organizacion, numero_beneficiarios
)
SELECT
  '99500000-0000-4000-8000-000000000001', id_pais, 'Organización Expediente QA',
  'Representante QA', '+56 9 1234 5678', 'legal@example.invalid',
  'Metropolitana', 'Santiago', 'Calle QA 123', 'Comunidad',
  'Organización temporal para probar expediente', 'centro_comunitario', 25
FROM public.paises WHERE codigo_iso = 'CL';

SELECT lives_ok($q$
  INSERT INTO public.informacion_legal (
    id_informacion_legal, id_organizacion, estado_personalidad_juridica,
    tipo_personalidad_juridica, numero_registro, fecha_constitucion, vigencia_directiva
  ) VALUES (
    '99510000-0000-4000-8000-000000000001',
    '99500000-0000-4000-8000-000000000001',
    'si', 'Fundación', 'REG-2026-001', '2020-01-15', 'Directiva vigente hasta 2027'
  )
$q$, 'Se puede registrar un antecedente legal asociado a una Organización');

INSERT INTO public.documentos_informacion_legal (
  id_informacion_legal, tipo, estado
) VALUES
  ('99510000-0000-4000-8000-000000000001', 'identidad_representante', 'pendiente'),
  ('99510000-0000-4000-8000-000000000001', 'identificacion_legal', 'no_aplica'),
  ('99510000-0000-4000-8000-000000000001', 'estatutos', 'pendiente');

SELECT is(
  (SELECT numero_registro FROM public.informacion_legal
   WHERE id_organizacion = '99500000-0000-4000-8000-000000000001'),
  'REG-2026-001',
  'Se consulta el expediente correspondiente a una Organización'
);
SELECT is(
  (SELECT count(*) FROM public.documentos_informacion_legal
   WHERE id_informacion_legal = '99510000-0000-4000-8000-000000000001'),
  3::bigint,
  'Se consultan todos los antecedentes documentales del expediente'
);

SELECT lives_ok($q$
  WITH archivo AS (
    INSERT INTO public.archivos (
      id_archivo, id_informacion_legal, bucket_id, ruta_objeto, nombre_original,
      mime_type, tamano_bytes, categoria, estado_carga
    ) VALUES (
      '99520000-0000-4000-8000-000000000001',
      '99510000-0000-4000-8000-000000000001',
      'fge-expedientes-legales',
      'expedientes/99500000-0000-4000-8000-000000000001/identidad_representante/prueba.pdf',
      'identidad.pdf', 'application/pdf', 128,
      'identidad_representante', 'disponible'
    ) RETURNING id_archivo
  )
  UPDATE public.documentos_informacion_legal
  SET estado = 'cargado', id_archivo = archivo.id_archivo
  FROM archivo
  WHERE id_informacion_legal = '99510000-0000-4000-8000-000000000001'
    AND tipo = 'identidad_representante'
$q$, 'Se registra un PDF privado y se asocia al antecedente correspondiente');

SELECT lives_ok($q$
  UPDATE public.informacion_legal
  SET numero_registro = 'REG-2026-002', vigencia_directiva = 'Actualizada'
  WHERE id_informacion_legal = '99510000-0000-4000-8000-000000000001'
$q$, 'Se pueden modificar antecedentes existentes');
SELECT is(
  (SELECT version FROM public.informacion_legal
   WHERE id_informacion_legal = '99510000-0000-4000-8000-000000000001'),
  2::bigint,
  'La actualización incrementa la versión de auditoría'
);

SELECT lives_ok($q$
  SELECT public.guardar_expediente_legal(
    '99500000-0000-4000-8000-000000000001',
    '{
      "estado_personalidad_juridica":"si",
      "tipo_personalidad_juridica":"Fundación",
      "numero_registro":"REG-2026-003",
      "fecha_constitucion":"2020-01-15",
      "vigencia_directiva":"Actualizada mediante operación transaccional",
      "documentos":[
        {"tipo":"identidad_representante","estado":"cargado"},
        {"tipo":"identificacion_legal","estado":"no_aplica"},
        {"tipo":"estatutos","estado":"pendiente"}
      ]
    }'::jsonb,
    2
  )
$q$, 'La operación transaccional modifica el expediente y conserva el PDF existente');
SELECT is(
  (SELECT numero_registro FROM public.informacion_legal
   WHERE id_informacion_legal = '99510000-0000-4000-8000-000000000001'),
  'REG-2026-003',
  'La modificación transaccional queda disponible para consulta'
);
SELECT throws_ok($q$
  SELECT public.guardar_expediente_legal(
    '99500000-0000-4000-8000-000000000001',
    '{
      "estado_personalidad_juridica":"si",
      "tipo_personalidad_juridica":"PJ",
      "numero_registro":"REG-ANTIGUO",
      "fecha_constitucion":"2020-01-15",
      "vigencia_directiva":"Antigua",
      "documentos":[
        {"tipo":"identidad_representante","estado":"cargado"},
        {"tipo":"identificacion_legal","estado":"no_aplica"},
        {"tipo":"estatutos","estado":"pendiente"}
      ]
    }'::jsonb,
    2
  )
$q$, '40001', NULL, 'Una versión antigua no sobrescribe antecedentes nuevos');
SELECT ok(
  (SELECT created_at IS NOT NULL AND updated_at IS NOT NULL
   FROM public.informacion_legal
   WHERE id_informacion_legal = '99510000-0000-4000-8000-000000000001'),
  'Los campos de auditoría se completan automáticamente'
);

SELECT throws_ok($q$
  INSERT INTO public.informacion_legal (id_organizacion, estado_personalidad_juridica)
  VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'si')
$q$, '23503', NULL, 'No se admite un expediente para una Organización inexistente');
SELECT throws_ok($q$
  INSERT INTO public.informacion_legal (id_organizacion, estado_personalidad_juridica)
  VALUES ('99500000-0000-4000-8000-000000000001', 'no')
$q$, '23505', NULL, 'Solo existe un expediente por Organización');
SELECT throws_ok($q$
  UPDATE public.informacion_legal SET tipo_personalidad_juridica = 'tipo-invalido'
  WHERE id_informacion_legal = '99510000-0000-4000-8000-000000000001'
$q$, '23514', NULL, 'Se rechaza un tipo de personalidad jurídica inválido');
SELECT throws_ok($q$
  UPDATE public.documentos_informacion_legal SET estado = 'cargado'
  WHERE id_informacion_legal = '99510000-0000-4000-8000-000000000001'
    AND tipo = 'estatutos'
$q$, '23514', NULL, 'Un documento cargado exige un archivo relacionado');

SET LOCAL ROLE anon;
SELECT throws_ok(
  $q$SELECT count(*) FROM public.informacion_legal$q$,
  '42501', NULL, 'Una sesión anónima no consulta expedientes legales'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
