BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT ok(
  EXISTS(SELECT 1 FROM public.paises WHERE nombre = 'Chile' AND codigo_iso = 'CL'),
  'Chile está registrado'
);
SELECT ok(
  EXISTS(SELECT 1 FROM public.paises WHERE nombre = 'Argentina' AND codigo_iso = 'AR'),
  'Argentina está registrado'
);
SELECT ok(
  EXISTS(SELECT 1 FROM public.paises WHERE nombre = 'Uruguay' AND codigo_iso = 'UY'),
  'Uruguay está registrado'
);

SELECT ok(
  NOT EXISTS(
    SELECT 1 FROM public.organizaciones
    WHERE id_organizacion = '15800000-0000-4000-8000-000000000000'
  ),
  'El catálogo institucional no necesita una organización ficticia'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.programas
    WHERE id_programa IN (
      '15800000-0000-4000-8000-000000000001',
      '15800000-0000-4000-8000-000000000002',
      '15800000-0000-4000-8000-000000000003',
      '15800000-0000-4000-8000-000000000004',
      '15800000-0000-4000-8000-000000000005',
      '15800000-0000-4000-8000-000000000006'
    )
  ),
  6::bigint,
  'Se conservan los seis UUID de los Programas Institucionales'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.programas
    WHERE nombre IN (
        'Programa de Formalización',
        'Espacios con Valor',
        'Referentes al Frente',
        'Una vuelta +',
        'Voluntariado Corporativo — Una hora para salvar al mundo',
        'Donación de Recursos a Organizaciones Comunitarias'
      )
  ),
  6::bigint,
  'Están disponibles los seis nombres oficiales definidos por FGE'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.programas
    WHERE id_programa IN (
      '15800000-0000-4000-8000-000000000001',
      '15800000-0000-4000-8000-000000000002',
      '15800000-0000-4000-8000-000000000003',
      '15800000-0000-4000-8000-000000000004',
      '15800000-0000-4000-8000-000000000005',
      '15800000-0000-4000-8000-000000000006'
    )
      AND NULLIF(btrim(descripcion), '') IS NOT NULL
      AND NULLIF(btrim(objetivo_general), '') IS NOT NULL
      AND NULLIF(btrim(objetivos_especificos), '') IS NOT NULL
      AND NULLIF(btrim(componentes_linea_accion), '') IS NOT NULL
      AND NULLIF(btrim(resultados_esperados), '') IS NOT NULL
  ),
  6::bigint,
  'Todos los programas tienen completos los campos obligatorios del modelo'
);

SELECT * FROM finish();
ROLLBACK;
