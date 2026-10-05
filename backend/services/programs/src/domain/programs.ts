import { ServiceError } from '../../../../shared/errors/src/index.ts';

export interface ProgramLine {
  id_linea_accion: string;
  id_programa: string;
  linea_accion: string;
  resultado_esperado: string;
  orden: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  version: number;
}

export interface Program {
  id_programa: string;
  nombre: string;
  descripcion: string;
  objetivo_general: string;
  objetivos_especificos: string;
  componentes_linea_accion: string;
  resultados_esperados: string;
  referencias_ods?: string;
  referencias_esg?: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  version: number;
}

export interface ProgramWithLines extends Program {
  lineas_accion: ProgramLine[];
}

export interface ProgramLineInput {
  linea_accion: string;
  resultado_esperado: string;
}

export interface ProgramFields {
  nombre: string;
  descripcion: string;
  objetivo_general: string;
  objetivos_especificos: string;
  lineas_accion: ProgramLineInput[];
  referencias_ods?: string;
  referencias_esg?: string;
}

export interface UpdateProgramInput {
  expectedVersion?: number;
  changes: Partial<ProgramFields>;
}

export interface ProgramsRepository {
  list(accessToken: string): Promise<ProgramWithLines[]>;
  getById(accessToken: string, id: string): Promise<ProgramWithLines>;
  create(accessToken: string, fields: ProgramFields): Promise<ProgramWithLines>;
  update(accessToken: string, id: string, input: UpdateProgramInput): Promise<ProgramWithLines>;
  archive(accessToken: string, id: string, expectedVersion: number): Promise<Program>;
}

const FIELD_NAMES = [
  'nombre', 'descripcion', 'objetivo_general', 'objetivos_especificos',
  'lineas_accion', 'referencias_ods', 'referencias_esg',
] as const;
type FieldName = typeof FIELD_NAMES[number];

function invalid(message: string): never {
  throw new ServiceError('DATOS_INVALIDOS', message, 400);
}

function objectInput(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return invalid('La solicitud debe contener un objeto JSON.');
  }
  const input = value as Record<string, unknown>;
  const extra = Object.keys(input).find((key) => !allowed.includes(key));
  if (extra) return invalid(`El campo ${extra} no está permitido.`);
  return input;
}

export function parseUuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    return invalid(`${field} debe ser un UUID válido.`);
  }
  return value;
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') return invalid(`${field} debe ser texto.`);
  const normalized = value.trim();
  if (!normalized) return invalid(`${field} es obligatorio.`);
  if (normalized.length > maximum) return invalid(`${field} no puede superar ${maximum} caracteres.`);
  return normalized;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return invalid(`${field} debe ser texto.`);
  const normalized = value.trim();
  if (normalized.length > 2000) return invalid(`${field} no puede superar 2000 caracteres.`);
  return normalized;
}

function lines(value: unknown): ProgramLineInput[] {
  if (!Array.isArray(value)) return invalid('Las líneas de acción deben enviarse como una lista.');
  if (value.length < 1 || value.length > 50) return invalid('El programa debe incluir entre 1 y 50 líneas de acción.');
  const seen = new Set<string>();
  return value.map((item, index) => {
    const input = objectInput(item, ['linea_accion', 'resultado_esperado']);
    const line = requiredText(input.linea_accion, `La línea de acción ${index + 1}`, 500);
    const key = line.toLocaleLowerCase('es');
    if (seen.has(key)) return invalid(`La línea de acción ${index + 1} está repetida.`);
    seen.add(key);
    return {
      linea_accion: line,
      resultado_esperado: requiredText(input.resultado_esperado, `El resultado esperado ${index + 1}`, 2000),
    };
  });
}

function parseField(name: FieldName, value: unknown): ProgramFields[FieldName] {
  switch (name) {
    case 'nombre': return requiredText(value, 'El nombre', 150);
    case 'descripcion': return requiredText(value, 'La descripción', 5000);
    case 'objetivo_general': return requiredText(value, 'El objetivo general', 3000);
    case 'objetivos_especificos': return requiredText(value, 'Los objetivos específicos', 5000);
    case 'lineas_accion': return lines(value);
    case 'referencias_ods': return optionalText(value, 'Las referencias ODS');
    case 'referencias_esg': return optionalText(value, 'Las referencias ESG');
  }
}

export function parseProgramFields(value: unknown): ProgramFields {
  const input = objectInput(value, FIELD_NAMES);
  const result: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    if ((name === 'referencias_ods' || name === 'referencias_esg') && input[name] === undefined) continue;
    result[name] = parseField(name, input[name]);
  }
  return result as unknown as ProgramFields;
}

export function parseUpdateInput(value: unknown): UpdateProgramInput {
  const input = objectInput(value, ['version_esperada', 'cambios']);
  const changesInput = objectInput(input.cambios, FIELD_NAMES);
  if (Object.keys(changesInput).length === 0) return invalid('Debes enviar al menos un campo para actualizar.');
  const changes: Record<string, unknown> = {};
  for (const [name, fieldValue] of Object.entries(changesInput)) {
    changes[name] = parseField(name as FieldName, fieldValue);
  }
  let expectedVersion: number | undefined;
  if (input.version_esperada !== undefined) {
    if (typeof input.version_esperada !== 'number' || !Number.isInteger(input.version_esperada) || input.version_esperada < 1) {
      return invalid('La versión esperada debe ser un entero mayor que cero.');
    }
    expectedVersion = input.version_esperada;
  }
  return { changes: changes as Partial<ProgramFields>, expectedVersion };
}

export function parseArchiveInput(value: unknown): number {
  const input = objectInput(value, ['version_esperada']);
  if (typeof input.version_esperada !== 'number' || !Number.isInteger(input.version_esperada) || input.version_esperada < 1) {
    return invalid('La versión esperada debe ser un entero mayor que cero.');
  }
  return input.version_esperada;
}
