import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';

export class AuditError extends ServiceError {
  readonly fields?: Record<string, string[]>;
  constructor(code: string, message: string, status: number, fields?: Record<string, string[]>) {
    super(code, message, status);
    this.fields = fields;
  }
}

const texto = (maximo: number, mensaje: string) => z.string()
  .trim()
  .max(maximo, mensaje)
  .refine(valor => !/[\x00-\x1f\x7f]/.test(valor), 'El filtro no admite caracteres de control.')
  .transform(valor => valor || undefined)
  .optional();

const fecha = z.iso.date().refine(value => !value.startsWith('0000-'), 'Fecha calendario inválida.');
const codigo = (patron: RegExp) => z.string().trim().regex(patron, 'Usa un código válido.').optional();
const uuidFiltro = z.uuid().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
export const OPERACIONES_AUDITORIA = [
  'INSERT', 'UPDATE', 'DELETE',
  'crear', 'modificar', 'archivar', 'restaurar', 'eliminar', 'inicio_sesion', 'inicio_sesion_fallido', 'lectura_documento',
] as const;
const consultaSchema = z.object({
  id_usuario: uuidFiltro.optional(),
  id_pais: uuidFiltro.optional(),
  usuario: texto(150, 'Usa hasta 150 caracteres.'),
  pais: texto(100, 'Usa hasta 100 caracteres.'),
  desde: fecha.optional(),
  hasta: fecha.optional(),
  operacion: z.enum(OPERACIONES_AUDITORIA, { error: 'Selecciona una acción válida.' }).optional(),
  entidad: codigo(/^[a-z][a-z0-9_.]{0,99}$/i),
  zona_horaria: z.string().max(64).regex(/^[A-Za-z]+(?:[_+-]?[A-Za-z0-9]+)*(?:\/[A-Za-z0-9]+(?:[_+-]?[A-Za-z0-9]+)*)*$/, 'La zona horaria no es válida.').optional(),
  limit: z.string().regex(/^[1-9][0-9]*$/, 'El límite debe ser un entero positivo.').optional(),
  cursor: z.string().min(1).max(256, 'El cursor no es válido.').optional(),
}).strict();

export const cursorSchema = z.object({
  fecha_hora: z.iso.datetime({ offset: true }).refine(value => !value.startsWith('0000-') && /T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:0\d|1[0-5]):[0-5]\d)$/.test(value)),
  id: z.string().regex(/^[1-9][0-9]{0,18}$/).refine(value => value.length < 19 || value <= '9223372036854775807'),
}).strict();

export interface AuditCursor { fecha_hora: string; id: string }
export interface AuditFilters {
  id_usuario?: string;
  id_pais?: string;
  usuario?: string;
  pais?: string;
  desde?: string;
  hasta?: string;
  operacion?: string;
  entidad?: string;
  zonaHoraria?: string;
  limit: number;
  cursor?: AuditCursor;
}

export const auditEventSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]*$/),
  id_usuario: z.guid().nullable().optional(),
  id_pais: z.guid().nullable().optional(),
  usuario: z.string().nullable(),
  rol: z.string().nullable(),
  fecha_hora: z.string().datetime({ offset: true }),
  pais: z.string().nullable(),
  ip: z.string().nullable(),
  operacion: z.string().min(1),
  entidad: z.string().min(1),
  referencia: z.string().nullable(),
  nombre_usuario: z.string().nullable().optional(),
  nombre_registro: z.string().nullable().optional(),
  campos_modificados: z.array(z.string()).nullable().optional(),
  cambio_estado: z.enum(['archivado', 'restaurado']).nullable().optional(),
  tipo_evento: z.string().nullable().optional(),
  zona_horaria: z.string().nullable().optional(),
  fecha_hora_local: z.string().nullable().optional(),
  request_id: z.string().nullable().optional(),
  fuente_ip: z.enum(['aplicacion','conexion_bd','proveedor_auth']).nullable().optional(),
  accion_especial: z.enum(['inicio_sesion', 'inicio_sesion_fallido', 'lectura_documento']).nullable().optional(),
});

export type AuditEvent = z.infer<typeof auditEventSchema>;
export interface AuditPage { events: AuditEvent[]; nextCursor: string | null }

export interface AuditRepository {
  list(token: string, filters: AuditFilters): Promise<AuditPage>;
}

function fieldsFrom(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = String(issue.path.at(0) ?? 'consulta');
    (fields[field] ??= []).push(issue.message);
  }
  return fields;
}

function decodeCursor(value: string): AuditCursor {
  try {
    const bytes = Buffer.from(value, 'base64url');
    if (bytes.toString('base64url') !== value) throw new Error('Cursor no canónico');
    const parsed = cursorSchema.safeParse(JSON.parse(bytes.toString('utf8')));
    if (parsed.success) return parsed.data;
  } catch {

  }
  throw new AuditError('DATOS_INVALIDOS', 'El cursor de la consulta no es válido.', 400, {
    cursor: ['El cursor de la consulta no es válido.'],
  });
}

export function encodeAuditCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function parseAuditQuery(search: URLSearchParams): AuditFilters {
  const allowed = new Set(['id_usuario', 'id_pais', 'usuario', 'pais', 'desde', 'hasta', 'operacion', 'entidad', 'zona_horaria', 'limit', 'cursor']);
  const raw: Record<string, string> = {};
  for (const [key, value] of search.entries()) {
    if (!allowed.has(key) || search.getAll(key).length !== 1) {
      throw new AuditError('DATOS_INVALIDOS', 'Los filtros de auditoría no son válidos.', 400, {
        [allowed.has(key) ? key : 'consulta']: ['El filtro no se admite o está repetido.'],
      });
    }
    raw[key] = value;
  }
  const parsed = consultaSchema.safeParse(raw);
  if (!parsed.success) throw new AuditError('DATOS_INVALIDOS', 'Revisa los filtros de auditoría.', 400, fieldsFrom(parsed.error));
  const limit = Number(parsed.data.limit ?? '50');
  if (limit > 100) throw new AuditError('DATOS_INVALIDOS', 'Revisa los filtros de auditoría.', 400, {
    limit: ['Usa un límite de hasta 100 eventos.'],
  });
  if (parsed.data.desde && parsed.data.hasta && parsed.data.desde > parsed.data.hasta) {
    throw new AuditError('DATOS_INVALIDOS', 'Revisa los filtros de auditoría.', 400, {
      hasta: ['La fecha de término debe ser igual o posterior al inicio.'],
    });
  }
  return {
    ...(parsed.data.id_usuario ? { id_usuario: parsed.data.id_usuario } : {}),
    ...(parsed.data.id_pais ? { id_pais: parsed.data.id_pais } : {}),
    usuario: parsed.data.usuario,
    pais: parsed.data.pais,
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
    operacion: parsed.data.operacion,
    entidad: parsed.data.entidad,
    zonaHoraria: parsed.data.zona_horaria,
    limit,
    ...(parsed.data.cursor ? { cursor: decodeCursor(parsed.data.cursor) } : {}),
  };
}
