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

const consultaSchema = z.object({
  usuario: texto(150, 'Usa hasta 150 caracteres.'),
  pais: texto(100, 'Usa hasta 100 caracteres.'),
  desde: z.string().date('Ingresa una fecha válida.').optional(),
  hasta: z.string().date('Ingresa una fecha válida.').optional(),
  operacion: texto(80, 'Usa hasta 80 caracteres.'),
  entidad: texto(100, 'Usa hasta 100 caracteres.'),
  limit: z.string().regex(/^[1-9][0-9]*$/, 'El límite debe ser un entero positivo.').optional(),
  cursor: z.string().min(1).max(256, 'El cursor no es válido.').optional(),
}).strict();

const cursorSchema = z.object({
  fecha_hora: z.string().datetime({ offset: true }),
  id: z.string().regex(/^[1-9][0-9]*$/),
}).strict();

export interface AuditCursor { fecha_hora: string; id: string }
export interface AuditFilters {
  usuario?: string;
  pais?: string;
  desde?: string;
  hasta?: string;
  operacion?: string;
  entidad?: string;
  limit: number;
  cursor?: AuditCursor;
}

export const auditEventSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]*$/),
  usuario: z.string().nullable(),
  rol: z.string().nullable(),
  fecha_hora: z.string().datetime({ offset: true }),
  pais: z.string().nullable(),
  ip: z.string().nullable(),
  operacion: z.string().min(1),
  entidad: z.string().min(1),
  referencia: z.string().nullable(),
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
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    if (parsed.success) return parsed.data;
  } catch {
    // La respuesta se normaliza abajo para no exponer detalles del cursor.
  }
  throw new AuditError('DATOS_INVALIDOS', 'El cursor de la consulta no es válido.', 400, {
    cursor: ['El cursor de la consulta no es válido.'],
  });
}

export function encodeAuditCursor(cursor: AuditCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

export function parseAuditQuery(search: URLSearchParams): AuditFilters {
  const allowed = new Set(['usuario', 'pais', 'desde', 'hasta', 'operacion', 'entidad', 'limit', 'cursor']);
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
    usuario: parsed.data.usuario,
    pais: parsed.data.pais,
    desde: parsed.data.desde,
    hasta: parsed.data.hasta,
    operacion: parsed.data.operacion,
    entidad: parsed.data.entidad,
    limit,
    ...(parsed.data.cursor ? { cursor: decodeCursor(parsed.data.cursor) } : {}),
  };
}
