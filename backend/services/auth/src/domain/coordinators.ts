import { ServiceError } from '../../../../shared/errors/src/index.ts';

export class CoordinatorError extends ServiceError {
  readonly fields?: Record<string, string[]>;
  constructor(code: string, message: string, status: number, fields?: Record<string, string[]>) {
    super(code, message, status);
    this.fields = fields;
  }
}
export interface Coordinator {
  id_usuario: string; nombre: string; correo: string; id_pais: string;
  activo: boolean; version: number; created_at: string; updated_at: string;
  pais?: { id_pais: string; nombre: string; codigo_iso: string };
  cambio_pais_pendiente?: boolean;
}
export interface CreateCoordinator { nombre: string; correo: string; id_pais: string }
export interface EditCoordinator { version_esperada: number; cambios: { nombre?: string; id_pais?: string } }
export interface CoordinatorRepository {
  execute(token: string, operation: string, input: Record<string, unknown>): Promise<any>;
  provision(input: CreateCoordinator, requestId: string): Promise<string>;
  sendAccess(correo: string): Promise<boolean>;
  assertProvisioningConfigured(): void;
}
function invalid(field: string, message: string): never {
  throw new CoordinatorError(field === 'id_pais' ? 'PAIS_PRINCIPAL_INVALIDO' : 'DATOS_INVALIDOS', message, 400, { [field]: [message] });
}
function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('solicitud', 'Se requiere un objeto JSON.');
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(k => !allowed.includes(k))) invalid('solicitud', 'La solicitud contiene campos no admitidos.');
  return result;
}
export function coordinatorId(value: unknown, field = 'id_usuario'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())) invalid(field, `El campo ${field} debe ser un UUID válido.`);
  return value.trim();
}
function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\x00-\x1f\x7f]/.test(value)) invalid('nombre', 'El nombre debe contener entre 1 y 120 caracteres.');
  return value.trim();
}
export function parseCoordinatorCreate(value: unknown): CreateCoordinator {
  const input = object(value, ['nombre', 'correo', 'id_pais']);
  const nombre = name(input.nombre);
  if (typeof input.correo !== 'string' || input.correo.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.correo.trim())) invalid('correo', 'Ingresa un correo válido.');
  return { nombre, correo: input.correo.trim().toLowerCase(), id_pais: coordinatorId(input.id_pais, 'id_pais') };
}
export function parseCoordinatorVersion(value: unknown): { version_esperada: number } {
  const input = object(value, ['version_esperada']);
  if (!Number.isSafeInteger(input.version_esperada) || Number(input.version_esperada) < 1) invalid('version_esperada', 'La versión debe ser un entero positivo.');
  return { version_esperada: input.version_esperada as number };
}
export function parseCoordinatorEdit(value: unknown): EditCoordinator {
  const input = object(value, ['version_esperada', 'cambios']);
  const version = parseCoordinatorVersion({ version_esperada: input.version_esperada });
  const changes = object(input.cambios, ['nombre', 'id_pais']);
  if (!Object.keys(changes).length) invalid('cambios', 'Debes informar al menos un cambio.');
  return { ...version, cambios: {
    ...('nombre' in changes ? { nombre: name(changes.nombre) } : {}),
    ...('id_pais' in changes ? { id_pais: coordinatorId(changes.id_pais, 'id_pais') } : {}),
  } };
}
