import { ServiceError } from '../../../../shared/errors/src/index.ts';

export class GuestError extends ServiceError {
  readonly fields?: Record<string, string[]>;
  constructor(code: string, message: string, status: number, fields?: Record<string, string[]>) {
    super(code, message, status);
    this.fields = fields;
  }
}

export interface Guest {
  id_invitado: string;
  nombre: string;
  correo: string;
  institucion?: string;
  motivo?: string;
  estado: 'pendiente' | 'aprobado' | 'rechazado' | 'revocado';
  enlace_token?: string;
  expira_en?: string;
  utilizado_en?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface CreateGuestInput {
  nombre: string;
  correo: string;
  institucion?: string;
  motivo?: string;
}

export interface ReviewGuestInput {
  version_esperada: number;
}

export interface GuestRepository {
  execute(token: string, operation: string, input: Record<string, unknown>): Promise<any>;
  sendGuestAccessLink(correo: string, link: string): Promise<boolean>;
}

function invalid(field: string, message: string): never {
  throw new GuestError('DATOS_INVALIDOS', message, 400, { [field]: [message] });
}

function object(value: unknown, allowed: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    invalid('solicitud', 'Se requiere un objeto JSON.');
  }
  const result = value as Record<string, unknown>;
  if (Object.keys(result).some(k => !allowed.includes(k))) {
    invalid('solicitud', 'La solicitud contiene campos no admitidos.');
  }
  return result;
}

export function guestId(value: unknown, field = 'id_invitado'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim())) {
    invalid(field, `El campo ${field} debe ser un UUID válido.`);
  }
  return value.trim();
}

function name(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\x00-\x1f\x7f]/.test(value)) {
    invalid('nombre', 'El nombre debe contener entre 1 y 120 caracteres.');
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || value.trim().length > maxLength || /[\x00-\x1f\x7f]/.test(value)) {
    invalid(field, `El campo ${field} no es válido o excede los ${maxLength} caracteres.`);
  }
  return value.trim();
}

export function parseGuestCreate(value: unknown): CreateGuestInput {
  const input = object(value, ['nombre', 'correo', 'institucion', 'motivo']);
  const nombre = name(input.nombre);
  
  if (typeof input.correo !== 'string' || input.correo.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.correo.trim())) {
    invalid('correo', 'Ingresa un correo electrónico válido.');
  }

  return {
    nombre,
    correo: input.correo.trim().toLowerCase(),
    institucion: optionalString(input.institucion, 'institucion', 150),
    motivo: optionalString(input.motivo, 'motivo', 255),
  };
}

export function parseGuestVersion(value: unknown): ReviewGuestInput {
  const input = object(value, ['version_esperada']);
  if (!Number.isSafeInteger(input.version_esperada) || Number(input.version_esperada) < 1) {
    invalid('version_esperada', 'La versión esperada debe ser un entero positivo.');
  }
  return { version_esperada: input.version_esperada as number };
}