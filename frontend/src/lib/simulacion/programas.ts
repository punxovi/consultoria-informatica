export interface PuntoPrograma {
  titulo: string;
  texto?: string;
}

export interface BloqueExtra {
  titulo: string;
  texto?: string;
  puntos?: PuntoPrograma[];
  etiquetas?: string[];
}

export interface ProgramaSimulacion {
  id: string;
  nombre: string;
  bajada: string;
  color: string;
  descripcion: string;
  introPuntos: string;
  puntos: PuntoPrograma[];
  cierre?: string;
  extras?: BloqueExtra[];
}

export const programasSimulacion: ProgramaSimulacion[] = [
  {
    id: 'formalizacion',
    nombre: 'Programa de Formalización',
    bajada: 'Formalización de organizaciones',
    color: '#1EAFDA',
    descripcion:
      'Tiene como objetivo principal acompañar a las organizaciones comunitarias en su proceso de formalización, salud, alimentación, etc.',
    introPuntos: 'Esto se logra a través de:',
    puntos: [
      { titulo: 'Definición de valores institucionales', texto: 'Establecer principios que guíen la actuación de la organización.' },
      { titulo: 'Conformación de equipos directivos', texto: 'Crear estructuras de liderazgo efectivas.' },
      { titulo: 'Capacitación para la mejora continua', texto: 'Proveer formación que permita a las organizaciones adaptarse y crecer.' },
      { titulo: 'Gestión de trámites administrativos', texto: 'Facilitar la obtención de la personalidad jurídica necesaria para operar legalmente.' },
      { titulo: 'Comunicación en redes sociales', texto: 'Mejorar y/o activar la comunicación a través de las redes sociales de la organización, ampliando el alcance de su trabajo.' },
    ],
    cierre:
      'Este programa promueve la autonomía de las organizaciones, permitiéndoles articularse con organismos públicos y privados, recibir donaciones y ampliar su alcance.',
  },
  {
    id: 'espacios-con-valor',
    nombre: 'Espacios con Valor',
    bajada: 'Mejoramiento de infraestructura',
    color: '#4C4688',
    descripcion:
      'El Programa de Mejoramiento de Infraestructura se centra en colaborar con las organizaciones de la red para gestionar recursos que mejoren los espacios donde se desarrollan sus actividades.',
    introPuntos: 'Los objetivos incluyen:',
    puntos: [
      { titulo: 'Fortalecimiento de la infraestructura', texto: 'Asegurar que las organizaciones puedan ofrecer servicios en condiciones adecuadas y sostenibles.' },
      { titulo: 'Condiciones dignas para las familias', texto: 'Mejorar el entorno en el que se atiende a la comunidad, garantizando un servicio de calidad.' },
    ],
  },
  {
    id: 'referentes-al-frente',
    nombre: 'Referentes al Frente',
    bajada: 'Fortalecimiento de líderes comunitarios',
    color: '#0E9F6E',
    descripcion:
      'El Programa de Fortalecimiento de Líderes Comunitarios busca promover la gestión y el liderazgo de los dirigentes sociales.',
    introPuntos: 'Las acciones incluyen:',
    puntos: [
      { titulo: 'Talleres y espacios de aprendizaje colectivo', texto: 'Fomentar la socialización de experiencias y buenas prácticas.' },
      { titulo: 'Acompañamiento individual en salud', texto: 'Proporcionar apoyo emocional y psicológico a los líderes en el área de la salud.' },
    ],
    cierre: 'Este programa es fundamental para impulsar el desarrollo y la transformación social de las comunidades.',
  },
  {
    id: 'una-vuelta-mas',
    nombre: 'Una vuelta +',
    bajada: 'Proyectos productivos sustentables',
    color: '#FF2471',
    descripcion:
      'Promueve la economía circular: permite a las empresas transformar sus materiales en desuso en productos corporativos con impacto ambiental y social medible, contribuyendo simultáneamente a sus objetivos de sostenibilidad y posicionamiento corporativo.',
    introPuntos: 'Los objetivos son:',
    puntos: [
      { titulo: 'Fortalecimiento de organizaciones comunitarias', texto: 'Apoyar proyectos productivos que amplíen la producción y aumenten ingresos.' },
      { titulo: 'Reducción del impacto ambiental', texto: 'Fomentar prácticas de consumo responsable y sostenibilidad.' },
      { titulo: 'Beneficio empresarial', texto: 'Resultados concretos para la estrategia de sostenibilidad de cada empresa.' },
    ],
    extras: [
      {
        titulo: 'Objetivos de Desarrollo Sostenible (ODS)',
        texto: 'La participación en UV+ contribuye directamente a:',
        etiquetas: [
          'ODS 8 · Trabajo decente y crecimiento económico',
          'ODS 10 · Reducción de desigualdades',
          'ODS 12 · Producción y consumo responsables',
          'ODS 13 · Acción por el clima',
          'ODS 17 · Alianzas para lograr los objetivos',
        ],
      },
      {
        titulo: 'Fortalecimiento de estrategias ESG',
        texto: 'Las empresas pueden incorporar resultados concretos en sus reportes de sostenibilidad relacionados con:',
        etiquetas: ['Economía circular', 'Gestión responsable de residuos', 'Compras sostenibles', 'Impacto social en comunidades vulnerables'],
      },
      {
        titulo: 'Beneficios para la empresa',
        puntos: [
          { titulo: 'Diferenciación corporativa', texto: 'UV+ permite desarrollar productos únicos, personalizados y alineados con la estrategia de sostenibilidad de cada empresa.' },
          { titulo: 'Valorización de residuos', texto: 'Transformación de materiales corporativos en desuso en nuevos productos útiles, evitando disposición final y generando trazabilidad.' },
        ],
      },
      {
        titulo: 'Impacto medible',
        texto: 'Cada proyecto puede generar indicadores asociados a:',
        etiquetas: ['Material recuperado', 'Productos elaborados', 'Organizaciones beneficiadas', 'Personas impactadas, creando ingresos genuinos', 'ODS contribuidos'],
      },
    ],
  },
  {
    id: 'voluntariado-corporativo',
    nombre: 'Una hora para salvar al mundo',
    bajada: 'Voluntariado corporativo',
    color: '#C9A227',
    descripcion: 'El programa articula acciones de voluntariado con el ámbito corporativo.',
    introPuntos: 'Busca:',
    puntos: [
      { titulo: 'Involucramiento de colaboradores', texto: 'Generar un sentido de comunidad y solidaridad a través de actividades conjuntas.' },
      { titulo: 'Promoción de la inclusión social', texto: 'Trabajar en favor de la cohesión social y el apoyo a las organizaciones comunitarias.' },
    ],
  },
  {
    id: 'donacion-de-recursos',
    nombre: 'Donación de Recursos',
    bajada: 'Donación de recursos a organizaciones comunitarias',
    color: '#E8742A',
    descripcion: 'Tiene como finalidad proveer apoyo a las organizaciones comunitarias.',
    introPuntos: 'Mediante:',
    puntos: [
      { titulo: 'Campañas recurrentes', texto: 'Organizar donaciones en fechas especiales, como el regreso a clases o festividades.' },
      { titulo: 'Asistencia permanente', texto: 'Proveer alimentos y otros recursos necesarios para satisfacer las demandas de las organizaciones.' },
    ],
  },
];

export const RUTA_PROGRAMAS_SIMULACION = '/simulacion-fundacion/programas';
