BEGIN;
SELECT plan(13);

SELECT has_table('public', 'diagnosticos', 'La tabla diagnosticos debe existir');
SELECT has_pk('public', 'diagnosticos', 'Debe tener clave primaria');
SELECT col_is_uuid('public', 'diagnosticos', 'id_diagnostico', 'El id_diagnostico debe ser UUID');
SELECT col_is_uuid('public', 'diagnosticos', 'id_organizacion', 'El id_organizacion debe ser UUID');
SELECT has_unique('public', 'diagnosticos', 'diagnosticos_organizacion_uq', 'Debe tener restricción UNIQUE para id_organizacion');

INSERT INTO public.organizaciones (id_organizacion, id_pais, nombre, nombre_representante, telefono, correo, region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo, descripcion_breve, tipo_organizacion, numero_beneficiarios)
VALUES ('00000000-0000-0000-0000-000000000001', (SELECT id_pais FROM public.paises LIMIT 1), 'Org Test', 'Rep', '123', 'correo@test.com', 'Reg', 'Com', 'Dir', 'Pub', 'Desc', 'otra', 10);

PREPARE insert_valid AS
  INSERT INTO public.diagnosticos (
    id_organizacion, fecha_diagnostico, mision, vision, caracteristicas_infraestructura,
    espacios_disponibles, recursos_existentes, danos_detectados,
    necesidades_prioritarias, observaciones, raciones, periodo_raciones
  ) VALUES (
    '00000000-0000-0000-0000-000000000001', CURRENT_DATE, 'Misión', 'Visión', 'Caract',
    'Espacios', 'Recursos', 'Daños', 'Necesidades', 'Obs', 10, 'diaria'
  );
SELECT lives_ok('insert_valid', 'Debe permitir insertar un diagnóstico válido');

PREPARE insert_duplicate AS
  INSERT INTO public.diagnosticos (
    id_organizacion, fecha_diagnostico, mision, vision, caracteristicas_infraestructura,
    espacios_disponibles, recursos_existentes, danos_detectados,
    necesidades_prioritarias, observaciones
  ) VALUES (
    '00000000-0000-0000-0000-000000000001', CURRENT_DATE, 'Misión 2', 'Visión 2', 'Caract 2',
    'Espacios 2', 'Recursos 2', 'Daños 2', 'Necesidades 2', 'Obs 2'
  );
SELECT throws_ok('insert_duplicate', '23505', NULL, 'No debe permitir más de un diagnóstico por organización');

INSERT INTO public.organizaciones (id_organizacion, id_pais, nombre, nombre_representante, telefono, correo, region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo, descripcion_breve, tipo_organizacion, numero_beneficiarios)
VALUES ('00000000-0000-0000-0000-000000000002', (SELECT id_pais FROM public.paises LIMIT 1), 'Org Test 2', 'Rep', '123', 'correo@test.com', 'Reg', 'Com', 'Dir', 'Pub', 'Desc', 'otra', 10);

PREPARE insert_null_raciones AS
  INSERT INTO public.diagnosticos (
    id_organizacion, fecha_diagnostico, mision, vision, caracteristicas_infraestructura,
    espacios_disponibles, recursos_existentes, danos_detectados,
    necesidades_prioritarias, observaciones, raciones, periodo_raciones
  ) VALUES (
    '00000000-0000-0000-0000-000000000002', CURRENT_DATE, 'M', 'V', 'C', 'E', 'R', 'D', 'N', 'O', NULL, NULL
  );
SELECT lives_ok('insert_null_raciones', 'Debe permitir raciones y periodo nulos simultáneamente');

PREPARE insert_raciones_no_periodo AS
  INSERT INTO public.diagnosticos (
    id_organizacion, fecha_diagnostico, mision, vision, caracteristicas_infraestructura,
    espacios_disponibles, recursos_existentes, danos_detectados,
    necesidades_prioritarias, observaciones, raciones, periodo_raciones
  ) VALUES (
    '00000000-0000-0000-0000-000000000002', CURRENT_DATE, 'M', 'V', 'C', 'E', 'R', 'D', 'N', 'O', 10, NULL
  );
SELECT throws_ok('insert_raciones_no_periodo', '23514', NULL, 'No debe permitir raciones sin periodo');

PREPARE insert_periodo_no_raciones AS
  INSERT INTO public.diagnosticos (
    id_organizacion, fecha_diagnostico, mision, vision, caracteristicas_infraestructura,
    espacios_disponibles, recursos_existentes, danos_detectados,
    necesidades_prioritarias, observaciones, raciones, periodo_raciones
  ) VALUES (
    '00000000-0000-0000-0000-000000000002', CURRENT_DATE, 'M', 'V', 'C', 'E', 'R', 'D', 'N', 'O', NULL, 'mensual'
  );
SELECT throws_ok('insert_periodo_no_raciones', '23514', NULL, 'No debe permitir periodo sin raciones');

PREPARE insert_empty_mision AS
  INSERT INTO public.diagnosticos (
    id_organizacion, fecha_diagnostico, mision, vision, caracteristicas_infraestructura,
    espacios_disponibles, recursos_existentes, danos_detectados,
    necesidades_prioritarias, observaciones
  ) VALUES (
    '00000000-0000-0000-0000-000000000002', CURRENT_DATE, '   ', 'V', 'C', 'E', 'R', 'D', 'N', 'O'
  );
SELECT throws_ok('insert_empty_mision', '23514', NULL, 'No debe permitir campos vacíos');

UPDATE public.diagnosticos SET raciones = 20, periodo_raciones = 'mensual' WHERE id_organizacion = '00000000-0000-0000-0000-000000000001';
SELECT results_eq(
  $$ SELECT version FROM public.diagnosticos WHERE id_organizacion = '00000000-0000-0000-0000-000000000001' $$,
  ARRAY[2::bigint],
  'La versión debe incrementar en 1 al actualizar'
);

SELECT results_eq(
  $$ SELECT count(*) > 0 FROM fge_private.historial_cambios WHERE tabla = 'diagnosticos' $$,
  ARRAY[true],
  'Debe registrar cambios de auditoría en historial_cambios'
);

SELECT * FROM finish();
ROLLBACK;
