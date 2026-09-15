-- Datos semilla para FGE
-- Estos datos se insertan al hacer `supabase start` o `supabase db reset`
--
-- IMPORTANTE: la organización con UUID 15800000-0000-4000-8000-000000000000
-- es ficticia y solo sostiene temporalmente los seis Programas Institucionales
-- oficiales. Cuando FGE entregue el padrón real, se deben reasignar los programas
-- mediante `programas.id_organizacion` y eliminar este registro temporal.

-- Insertar roles básicos de la plataforma
INSERT INTO public.roles (codigo, nombre) VALUES
('ADMIN', 'Administrador'),
('COORD', 'Coordinador'),
('INVIT', 'Invitado')
ON CONFLICT (codigo) DO UPDATE SET nombre = EXCLUDED.nombre;

-- Organización transitoria: no contiene datos personales ni representa a una
-- organización real. Chile se usa solo para satisfacer la relación territorial
-- obligatoria del modelo mientras la clienta entrega el padrón definitivo.
INSERT INTO public.organizaciones (
  id_organizacion,
  id_pais,
  nombre,
  nombre_representante,
  telefono,
  correo,
  region_departamento,
  comuna_municipio_ciudad,
  direccion,
  publico_objetivo,
  descripcion_breve,
  tipo_organizacion,
  tipo_organizacion_otro,
  numero_beneficiarios
)
SELECT
  '15800000-0000-4000-8000-000000000000',
  id_pais,
  'Organización temporal FGE (FICTICIA)',
  'Representante pendiente (FICTICIO)',
  '000000000',
  'organizacion-temporal@example.invalid',
  'Pendiente de información oficial',
  'Pendiente de información oficial',
  'Pendiente de información oficial',
  'Dato temporal para desarrollo',
  'Registro ficticio para alojar temporalmente los Programas Institucionales oficiales de FGE.',
  'otra',
  'Organización temporal de desarrollo',
  0
FROM public.paises
WHERE codigo_iso = 'CL'
ON CONFLICT (id_organizacion) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion_breve = EXCLUDED.descripcion_breve;

-- Los contenidos de estos seis programas provienen del documento oficial
-- `PROGRAMAS FGE.docx`, entregado por la clienta el 20 de agosto de 2026.
-- Los programas son reales; únicamente su organización asociada es temporal.
INSERT INTO public.programas (
  id_programa,
  id_organizacion,
  nombre,
  descripcion,
  objetivo_general,
  objetivos_especificos,
  componentes_linea_accion,
  resultados_esperados
) VALUES
(
  '15800000-0000-4000-8000-000000000001',
  '15800000-0000-4000-8000-000000000000',
  'Programa de Formalización',
  'Acompaña a las organizaciones comunitarias en su proceso de formalización, salud, alimentación y fortalecimiento institucional.',
  'Promover la autonomía de las organizaciones para que puedan articularse con organismos públicos y privados, recibir donaciones y ampliar su alcance.',
  'Definir valores institucionales; conformar equipos directivos; capacitar para la mejora continua; facilitar la obtención de personalidad jurídica; mejorar o activar la comunicación mediante redes sociales.',
  'Definición de valores institucionales; conformación de equipos directivos; capacitación; gestión de trámites administrativos; fortalecimiento de la comunicación y redes sociales.',
  'Organizaciones formalizadas, autónomas, con estructuras de liderazgo y mejores capacidades para articularse, recibir apoyo y ampliar su trabajo.'
),
(
  '15800000-0000-4000-8000-000000000002',
  '15800000-0000-4000-8000-000000000000',
  'Espacios con Valor',
  'Programa de mejoramiento de infraestructura que colabora con las organizaciones de la red para gestionar recursos destinados a sus espacios comunitarios.',
  'Fortalecer la infraestructura de las organizaciones para que desarrollen sus actividades en condiciones adecuadas y sostenibles.',
  'Mejorar los espacios donde se desarrollan las actividades y asegurar condiciones dignas para las familias atendidas.',
  'Gestión de recursos; mejora de infraestructura; articulación de alianzas; adecuación de espacios comunitarios.',
  'Espacios comunitarios fortalecidos, sostenibles y aptos para ofrecer servicios de calidad a las familias.'
),
(
  '15800000-0000-4000-8000-000000000003',
  '15800000-0000-4000-8000-000000000000',
  'Referentes al Frente',
  'Programa de fortalecimiento de líderes comunitarios orientado a promover la gestión y el liderazgo de dirigentes sociales.',
  'Impulsar el desarrollo, la autonomía y la transformación social de las comunidades mediante el fortalecimiento de sus referentes.',
  'Fomentar el aprendizaje colectivo y la socialización de experiencias; brindar acompañamiento individual en salud emocional y psicológica.',
  'Talleres; espacios de aprendizaje colectivo; intercambio de buenas prácticas; acompañamiento individual en salud.',
  'Liderazgos comunitarios fortalecidos, con mejores capacidades de gestión y redes de apoyo.'
),
(
  '15800000-0000-4000-8000-000000000004',
  '15800000-0000-4000-8000-000000000000',
  'Una vuelta +',
  'Programa que promueve la economía circular y permite transformar materiales corporativos en desuso en productos con impacto ambiental y social medible.',
  'Generar impacto social, ambiental y económico mediante proyectos productivos sustentables y la valorización de materiales en desuso.',
  'Fortalecer organizaciones comunitarias; ampliar la producción y los ingresos; reducir el impacto ambiental; contribuir a objetivos ODS y estrategias ESG; diferenciar a las empresas participantes.',
  'Economía circular; proyectos productivos; reutilización de materiales; compras sostenibles; alianzas empresariales; medición de impacto.',
  'Materiales recuperados y transformados, productos elaborados, organizaciones fortalecidas, personas impactadas e ingresos genuinos.'
),
(
  '15800000-0000-4000-8000-000000000005',
  '15800000-0000-4000-8000-000000000000',
  'Voluntariado Corporativo — Una hora para salvar al mundo',
  'Programa que articula acciones de voluntariado con el ámbito corporativo y sus colaboradores.',
  'Generar involucramiento, comunidad y solidaridad mediante actividades conjuntas con organizaciones comunitarias.',
  'Involucrar a colaboradores de empresas; promover la inclusión social; fortalecer la cohesión y el trabajo conjunto.',
  'Acciones de voluntariado corporativo; articulación con empresas; actividades comunitarias; promoción de la solidaridad.',
  'Colaboradores involucrados y organizaciones comunitarias fortalecidas mediante acciones inclusivas y solidarias.'
),
(
  '15800000-0000-4000-8000-000000000006',
  '15800000-0000-4000-8000-000000000000',
  'Donación de Recursos a Organizaciones Comunitarias',
  'Programa destinado a proveer apoyo y recursos a organizaciones comunitarias.',
  'Responder a las necesidades de las organizaciones mediante campañas y asistencia permanente.',
  'Organizar donaciones en fechas especiales y proveer alimentos u otros recursos necesarios.',
  'Campañas recurrentes; regreso a clases; festividades; asistencia alimentaria; entrega permanente de recursos.',
  'Organizaciones apoyadas de forma oportuna y con recursos suficientes para atender las necesidades de sus comunidades.'
)
ON CONFLICT (id_programa) DO UPDATE SET
  nombre = EXCLUDED.nombre,
  descripcion = EXCLUDED.descripcion,
  objetivo_general = EXCLUDED.objetivo_general,
  objetivos_especificos = EXCLUDED.objetivos_especificos,
  componentes_linea_accion = EXCLUDED.componentes_linea_accion,
  resultados_esperados = EXCLUDED.resultados_esperados;
