import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { booleanQuery, uuid } from './validation.ts';

const uuidSchema = (label: string) => z.string({ error: `${label} debe ser texto.` })
  .uuid(`${label} debe ser un UUID válido.`);

const requiredText = (label: string, maximum: number) => z.string({
  error: `${label} debe ser texto.`,
}).trim()
  .min(1, `${label} es obligatorio.`)
  .max(maximum, `${label} no puede superar ${maximum} caracteres.`);

const optionalText = (label: string, maximum: number) => z.string({
  error: `${label} debe ser texto.`,
}).trim()
  .max(maximum, `${label} no puede superar ${maximum} caracteres.`)
  .nullable()
  .optional()
  .transform((value) => value || null);

const meetingDateSchema = z.string({ error: 'La fecha de reunión debe ser texto.' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de reunión debe usar el formato AAAA-MM-DD.')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  }, 'La fecha de reunión debe ser una fecha válida.');

const attendeesSchema = z.array(requiredText('Cada asistente', 150), {
  error: 'Los asistentes deben enviarse como una lista.',
})
  .min(1, 'Debes indicar al menos un asistente.')
  .max(100, 'No se pueden registrar más de 100 asistentes.')
  .superRefine((attendees, context) => {
    const normalized = new Set<string>();
    attendees.forEach((attendee, index) => {
      const key = attendee.toLocaleLowerCase('es');
      if (normalized.has(key)) {
        context.addIssue({ code: 'custom', message: 'Los asistentes no pueden repetirse.', path: [index] });
      }
      normalized.add(key);
    });
  });

const externalAttendeesSchema = z.string({ error: 'Los asistentes externos deben ser texto.' })
  .trim()
  .max(500, 'Los asistentes externos no pueden superar 500 caracteres.')
  .refine(
    (value) => value.length === 0 || value.length >= 3,
    'Los asistentes externos deben tener al menos 3 caracteres.',
  );

const createFields = {
  id_organizacion: uuidSchema('La organización'),
  id_plan: uuidSchema('El plan'),
  id_accion: uuidSchema('La acción').nullable().optional().transform((value) => value ?? null),
  objetivo: requiredText('El objetivo', 1000),
  fecha_reunion: meetingDateSchema,
  asistentes: attendeesSchema,
  asistentes_externos: externalAttendeesSchema.optional().default(''),
  observaciones: optionalText('Las observaciones', 2000),
};

const updateFields = {
  id_plan: createFields.id_plan,
  id_accion: uuidSchema('La acción').nullable(),
  objetivo: createFields.objetivo,
  fecha_reunion: createFields.fecha_reunion,
  asistentes: createFields.asistentes,
  asistentes_externos: externalAttendeesSchema,
  observaciones: z.string({ error: 'Las observaciones deben ser texto.' })
    .trim().max(2000, 'Las observaciones no pueden superar 2000 caracteres.')
    .nullable().transform((value) => value || null),
};

export const createMeetingMinuteSchema = z.object(createFields).strict();

export const updateMeetingMinuteSchema = z.object({
  version_esperada: z.number({ error: 'La versión esperada debe ser numérica.' })
    .int('La versión esperada debe ser un entero mayor que cero.')
    .positive('La versión esperada debe ser un entero mayor que cero.'),
  cambios: z.object(updateFields).partial().strict()
    .refine((changes) => Object.keys(changes).length > 0, 'Debes enviar al menos un campo para actualizar.'),
}).strict();

export type CreateMeetingMinuteInput = z.infer<typeof createMeetingMinuteSchema>;
export type MeetingMinuteChanges = z.infer<typeof updateMeetingMinuteSchema>['cambios'];
export interface UpdateMeetingMinuteInput {
  expectedVersion: number;
  changes: MeetingMinuteChanges;
}

export interface MeetingMinute {
  id_acta: string;
  id_organizacion: string;
  id_plan: string;
  id_accion: string | null;
  objetivo: string;
  fecha_reunion: string;
  asistentes: string[];
  asistentes_externos: string;
  observaciones: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  version: number;
}

export interface MeetingMinuteFilters {
  organizationId?: string;
  planId?: string;
  actionId?: string;
  includeArchived: boolean;
}

export interface MeetingMinutesRepository {
  list(token: string, filters: MeetingMinuteFilters): Promise<MeetingMinute[]>;
  getById(token: string, id: string): Promise<MeetingMinute>;
  create(token: string, input: CreateMeetingMinuteInput): Promise<MeetingMinute>;
  update(token: string, id: string, input: UpdateMeetingMinuteInput): Promise<MeetingMinute>;
}

function invalidZod(error: z.ZodError): never {
  const issue = error.issues[0];
  throw new ServiceError('DATOS_INVALIDOS', issue?.message ?? 'Los datos del acta no son válidos.', 400, {
    issues: error.issues.map(({ path, message }) => ({ path, message })),
  });
}

export function parseCreateMeetingMinute(value: unknown): CreateMeetingMinuteInput {
  const result = createMeetingMinuteSchema.safeParse(value);
  if (!result.success) return invalidZod(result.error);
  return result.data;
}

export function parseUpdateMeetingMinute(value: unknown): UpdateMeetingMinuteInput {
  const result = updateMeetingMinuteSchema.safeParse(value);
  if (!result.success) return invalidZod(result.error);
  return { expectedVersion: result.data.version_esperada, changes: result.data.cambios };
}

export function parseMeetingMinuteFilters(url: URL): MeetingMinuteFilters {
  const allowed = new Set(['id_organizacion', 'id_plan', 'id_accion', 'incluir_archivadas']);
  const extra = [...url.searchParams.keys()].find((key) => !allowed.has(key));
  if (extra) throw new ServiceError('DATOS_INVALIDOS', `El filtro ${extra} no está permitido.`, 400);
  const organizationId = url.searchParams.get('id_organizacion');
  const planId = url.searchParams.get('id_plan');
  const actionId = url.searchParams.get('id_accion');
  return {
    ...(organizationId ? { organizationId: uuid(organizationId, 'La organización') } : {}),
    ...(planId ? { planId: uuid(planId, 'El plan') } : {}),
    ...(actionId ? { actionId: uuid(actionId, 'La acción') } : {}),
    includeArchived: booleanQuery(url.searchParams.get('incluir_archivadas'), 'incluir_archivadas'),
  };
}
