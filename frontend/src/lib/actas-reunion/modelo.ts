
import { z } from 'zod';
import type { CamposCompromiso } from '../compromisos/modelo';

const texto = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `No puede superar ${max} caracteres.`);

const textoObligatorio = (max: number, campo: string) =>
  texto(max).min(1, `${campo} es obligatorio.`);

function obtenerFechaLocalActual(): string {
  const hoy = new Date();

  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');

  return `${anio}-${mes}-${dia}`;
}

const fecha = texto(10)
  .refine(
    (valor) =>
      /^\d{4}-\d{2}-\d{2}$/.test(valor) &&
      !Number.isNaN(Date.parse(`${valor}T00:00:00Z`)) &&
      new Date(`${valor}T00:00:00Z`).toISOString().slice(0, 10) === valor,
    'Ingresa una fecha válida.',
  )
  .refine(
    (valor) => valor <= obtenerFechaLocalActual(),
    'La fecha de la reunión no puede ser futura.',
  );

export const camposActaSchema = z
  .object({
    id_plan: z.string().uuid('Selecciona un plan válido.'),
    id_accion: z.union([z.literal(''), z.string().uuid('Selecciona una acción válida.')]),
    fecha_reunion: fecha,
    asistentes: z
      .array(texto(150).min(1))
      .min(1, 'Debes seleccionar al menos un asistente.')
      .max(100)
      .refine(
        (valores) =>
          new Set(valores.map((v) => v.toLocaleLowerCase('es'))).size ===
          valores.length,
        'Los asistentes no pueden repetirse.',
      ),
    asistentes_externos: texto(500).refine(
      (v) => !v || v.length >= 3,
      'Ingresa al menos 3 caracteres.',
    ),
    objetivo: texto(1000).min(1, 'El objetivo es obligatorio.'),
    observaciones: texto(2000),
  })
  .strict();

export type CamposActa = z.infer<typeof camposActaSchema>;

export interface ActaReunion extends CamposActa {
  id_acta: string;
  id_organizacion: string;
  version: number;
  created_at: string;
  updated_at: string;
  compromisos?: Array<CamposCompromiso & { id_compromiso: string; estado: 'pendiente' | 'cumplido' }>;
}

export interface CatalogoActas {
  puede_gestionar: boolean;
  planes: Array<{ id_plan: string; nombre: string }>;
  acciones: Array<{ id_accion: string; id_plan: string; nombre: string }>;
  asistentes: string[];
}

export interface GuardarActa {
  campos: CamposActa;
  compromisos?: CamposCompromiso[];
}

export interface ServicioActasReunion {
  obtener(idOrganizacion: string): Promise<ActaReunion[]>;

  crear(
    idOrganizacion: string,
    entrada: GuardarActa,
  ): Promise<ActaReunion>;

  actualizar(
    idOrganizacion: string,
    idActa: string,
    version: number,
    entrada: GuardarActa,
  ): Promise<ActaReunion>;
}
