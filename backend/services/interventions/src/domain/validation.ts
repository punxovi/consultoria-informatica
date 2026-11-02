import { ServiceError } from '../../../../shared/errors/src/index.ts';

export function invalid(message: string): never {
  throw new ServiceError('DATOS_INVALIDOS', message, 400);
}

export function objectInput(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('La solicitud debe contener un objeto JSON.');
  }
  const input = value as Record<string, unknown>;
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) return invalid(`El campo ${extra} no está permitido.`);
  return input;
}

export function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return invalid(`${field} debe ser un UUID válido.`);
  }
  return value;
}

export function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') return invalid(`${field} debe ser texto.`);
  const normalized = value.trim();
  if (!normalized) return invalid(`${field} es obligatorio.`);
  if (normalized.length > maximum) return invalid(`${field} no puede superar ${maximum} caracteres.`);
  return normalized;
}

export function optionalText(value: unknown, field: string, maximum: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return invalid(`${field} debe ser texto.`);
  const normalized = value.trim();
  if (normalized.length > maximum) return invalid(`${field} no puede superar ${maximum} caracteres.`);
  return normalized || null;
}

export function date(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return invalid(`${field} debe usar el formato AAAA-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return invalid(`${field} debe ser una fecha válida.`);
  }
  return value;
}

export function expectedVersion(value: unknown): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    return invalid('La versión esperada debe ser un entero mayor que cero.');
  }
  return value;
}

export function booleanQuery(value: string | null, field: string): boolean {
  if (value === null || value === 'false') return false;
  if (value === 'true') return true;
  return invalid(`${field} debe ser booleano.`);
}
