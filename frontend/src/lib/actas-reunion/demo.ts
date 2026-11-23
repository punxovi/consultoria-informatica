import type {
  ActaReunion,
  GuardarActa,
  ServicioActasReunion,
} from './modelo.ts';
import { registrarCompromisosDelActa } from '../compromisos/demo.ts';
import { camposCompromisoSchema } from '../compromisos/modelo.ts';

const actasDemo: ActaReunion[] = [
  {
    id_acta: 'acta-1',
    id_organizacion: 'organizacion-demo',
    id_plan: 'plan-1',
    id_accion: 'accion-1',
    fecha_reunion: '2026-10-05',
    asistentes: [
      'Constanza Cauchupan',
      'Gabriel Orellana',
      'Jorge Páez',
    ],
    asistentes_externos:
      'María González, representante de la organización',
    objetivo:
      'Coordinar las próximas acciones de apoyo comunitario y revisar los avances del plan de intervención.',
    observaciones:
      'Se acuerda mantener coordinación semanal y realizar seguimiento a los compromisos establecidos.',
    version: 1,
    created_at: '2026-10-05T15:00:00Z',
    updated_at: '2026-10-05T15:00:00Z',
  },
  {
    id_acta: 'acta-2',
    id_organizacion: 'organizacion-demo',
    id_plan: 'plan-2',
    id_accion: 'accion-2',
    fecha_reunion: '2026-09-24',
    asistentes: [
      'Benjamín Molina',
      'Luis Bustamante',
    ],
    asistentes_externos: '',
    objetivo:
      'Revisar las necesidades actuales de la organización y definir prioridades de trabajo.',
    observaciones:
      'Se identifican necesidades relacionadas con infraestructura y recursos disponibles.',
    version: 1,
    created_at: '2026-09-24T15:00:00Z',
    updated_at: '2026-09-24T15:00:00Z',
  },
  {
    id_acta: 'acta-3',
    id_organizacion: 'organizacion-demo',
    id_plan: 'plan-1',
    id_accion: 'accion-3',
    fecha_reunion: '2026-09-12',
    asistentes: [
      'Constanza Cauchupan',
      'Benjamín Miranda',
    ],
    asistentes_externos: 'Carlos Pérez',
    objetivo:
      'Analizar el estado de las acciones realizadas durante el período anterior.',
    observaciones:
      'Se acuerda revisar nuevamente los resultados durante la próxima reunión.',
    version: 1,
    created_at: '2026-09-12T15:00:00Z',
    updated_at: '2026-09-12T15:00:00Z',
  },
];

const registros = new Map(actasDemo.map((acta) => [acta.id_acta, structuredClone(acta)]));

export function crearDemoActas(): ServicioActasReunion {

  return {
    async obtener(idOrganizacion) {
      await new Promise((resolve) => setTimeout(resolve, 400));

      return Array.from(registros.values())
        .filter((acta) => acta.id_organizacion === idOrganizacion)
        .map((acta) => structuredClone(acta));
    },

    async crear(idOrganizacion, entrada: GuardarActa) {
      const compromisos = (entrada.compromisos ?? []).map(c => camposCompromisoSchema.parse(c));
      await new Promise((resolve) => setTimeout(resolve, 500));

      const ahora = new Date().toISOString();

      const acta: ActaReunion = {
        ...entrada.campos,
        id_acta: crypto.randomUUID(),
        id_organizacion: idOrganizacion,
        version: 1,
        created_at: ahora,
        updated_at: ahora,
      };

      registrarCompromisosDelActa(idOrganizacion, acta.id_acta, compromisos);
      registros.set(acta.id_acta, acta);

      return structuredClone(acta);
    },

    async actualizar(
      idOrganizacion,
      idActa,
      version,
      entrada: GuardarActa,
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));

      const anterior = registros.get(idActa);

      if (!anterior || anterior.id_organizacion !== idOrganizacion) {
        throw new Error('El acta no existe.');
      }

      if (anterior.version !== version) {
        throw new Error(
          'El acta fue modificada. Recarga los datos antes de continuar.',
        );
      }

      const acta: ActaReunion = {
        ...anterior,
        ...entrada.campos,
        version: anterior.version + 1,
        updated_at: new Date().toISOString(),
      };

      registros.set(idActa, acta);

      return structuredClone(acta);
    },
  };
}
