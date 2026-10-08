BEGIN;
SELECT plan(10);

-- 1. Verificar existencia de columnas nuevas
SELECT has_column('public', 'actas', 'fecha_reunion', 'Debe tener columna fecha_reunion');
SELECT has_column('public', 'actas', 'observaciones', 'Debe tener columna observaciones');
SELECT has_column('public', 'actas', 'id_organizacion', 'Debe tener columna id_organizacion');
SELECT has_column('public', 'actas', 'id_plan', 'Debe tener columna id_plan');
SELECT has_column('public', 'actas', 'asistentes', 'Debe tener columna asistentes');
SELECT has_column('public', 'actas', 'asistentes_externos', 'Debe tener columna asistentes_externos');

-- 2. Restricciones de integridad (FKs ya comprobadas implicitamente por inserción)
INSERT INTO public.organizaciones (id_organizacion, id_pais, nombre, nombre_representante, telefono, correo, region_departamento, comuna_municipio_ciudad, direccion, publico_objetivo, descripcion_breve, tipo_organizacion, numero_beneficiarios)
VALUES ('00000000-0000-0000-0000-000000000010', (SELECT id_pais FROM public.paises LIMIT 1), 'Org Test', 'Rep', '123', 'correo@test.com', 'Reg', 'Com', 'Dir', 'Pub', 'Desc', 'otra', 10);

INSERT INTO public.programas (id_programa, id_organizacion, nombre, descripcion, objetivo_general, objetivos_especificos, componentes_linea_accion, resultados_esperados)
VALUES ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'Prog Test', 'Desc', 'Obj', 'Esp', 'Comp', 'Res');

INSERT INTO public.planes (id_plan, id_programa, id_organizacion, nombre, situacion_necesidad, objetivo_general, objetivos_especificos, resultado_esperado, responsable_nombre, fecha_inicio, fecha_termino)
VALUES ('00000000-0000-0000-0000-000000000030', '00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000010', 'Plan', 'Sit', 'Obj', 'Esp', 'Res', 'Resp', CURRENT_DATE, CURRENT_DATE);

-- Inserción válida de acta
PREPARE insert_valid AS
  INSERT INTO public.actas (
    id_organizacion, id_plan, id_accion, objetivo, fecha_reunion, observaciones, asistentes, asistentes_externos
  ) VALUES (
    '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000030', NULL, 'Obj', CURRENT_DATE, 'Obs', ARRAY['User 1'], 'Ext 1'
  );
SELECT lives_ok('insert_valid', 'Debe permitir insertar un acta válida');

-- Validar que id_accion puede ser nulo
PREPARE insert_null_accion AS
  INSERT INTO public.actas (
    id_organizacion, id_plan, id_accion, objetivo, fecha_reunion
  ) VALUES (
    '00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000030', NULL, 'Obj 2', CURRENT_DATE
  );
SELECT lives_ok('insert_null_accion', 'Debe permitir id_accion nulo');

-- Validar auditoria (version)
UPDATE public.actas SET objetivo = 'Obj 3' WHERE objetivo = 'Obj';
SELECT results_eq(
  $$ SELECT version FROM public.actas WHERE objetivo = 'Obj 3' $$,
  ARRAY[2::bigint],
  'La versión debe incrementar en 1 al actualizar el acta'
);

SELECT results_eq(
  $$ SELECT count(*) > 0 FROM fge_private.historial_cambios WHERE tabla = 'actas' $$,
  ARRAY[true],
  'Debe registrar cambios de auditoría en historial_cambios para actas'
);

SELECT * FROM finish();
ROLLBACK;
