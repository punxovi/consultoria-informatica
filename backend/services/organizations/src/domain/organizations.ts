import { ServiceError } from '../../../../shared/errors/src/index.ts';

export const ORGANIZATION_TYPES = [
  'comedor_merendero',
  'centro_comunitario',
  'emprendimiento_uv',
  'otra',
] as const;

export type OrganizationType = typeof ORGANIZATION_TYPES[number];

export interface CountrySummary {
  id_pais: string;
  codigo_iso: string;
  nombre: string;
}

export interface Organization {
  id_organizacion: string;
  id_pais: string;
  nombre: string;
  nombre_representante: string;
  telefono: string;
  correo: string;
  region_departamento: string;
  comuna_municipio_ciudad: string;
  direccion: string;
  publico_objetivo: string;
  descripcion_breve: string;
  tipo_organizacion: OrganizationType;
  tipo_organizacion_otro: string | null;
  numero_beneficiarios: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  archived_at: string | null;
  version: number;
  pais: CountrySummary;
}

export interface OrganizationFields {
  id_pais: string;
  nombre: string;
  nombre_representante: string;
  telefono: string;
  correo: string;
  region_departamento: string;
  comuna_municipio_ciudad: string;
  direccion: string;
  publico_objetivo: string;
  descripcion_breve: string;
  tipo_organizacion: OrganizationType;
  tipo_organizacion_otro?: string | null;
  numero_beneficiarios: number;
}

export interface OrganizationFilters {
  idPais?: string;
  includeArchived: boolean;
}

export interface UpdateOrganizationInput {
  expectedVersion?: number;
  changes: Partial<OrganizationFields>;
}

export interface OrganizationsRepository {
  list(accessToken: string, filters: OrganizationFilters): Promise<Organization[]>;
  getById(accessToken: string, id: string): Promise<Organization>;
  create(accessToken: string, fields: OrganizationFields): Promise<Organization>;
  update(
    accessToken: string,
    id: string,
    changes: Partial<OrganizationFields>,
    expectedVersion?: number,
  ): Promise<Organization>;
  listCountries(accessToken: string): Promise<CountrySummary[]>;
}

const FIELD_NAMES = [
  'id_pais',
  'nombre',
  'nombre_representante',
  'telefono',
  'correo',
  'region_departamento',
  'comuna_municipio_ciudad',
  'direccion',
  'publico_objetivo',
  'descripcion_breve',
  'tipo_organizacion',
  'tipo_organizacion_otro',
  'numero_beneficiarios',
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

function email(value: unknown): string {
  const normalized = requiredText(value, 'El correo', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return invalid('El correo debe tener un formato válido.');
  }
  return normalized;
}

function phone(value: unknown): string {
  const normalized = requiredText(value, 'El teléfono', 25);
  if (!/^[+0-9() .-]{6,25}$/.test(normalized)) {
    return invalid('El teléfono contiene caracteres no permitidos.');
  }
  if ((normalized.match(/\d/g) ?? []).length > 15) {
    return invalid('El teléfono no puede superar 15 números.');
  }
  return normalized;
}

function beneficiaries(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return invalid('El número de beneficiarios debe ser entero.');
  }
  if (value < 0 || value > 10_000_000) {
    return invalid('El número de beneficiarios debe estar entre 0 y 10000000.');
  }
  return value;
}

function organizationType(value: unknown): OrganizationType {
  if (typeof value !== 'string' || !ORGANIZATION_TYPES.includes(value as OrganizationType)) {
    return invalid('El tipo de organización no es válido.');
  }
  return value as OrganizationType;
}

function otherType(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return invalid('El otro tipo de organización debe ser texto.');
  const normalized = value.trim();
  if (normalized.length < 2 || normalized.length > 100) {
    return invalid('El otro tipo de organización debe tener entre 2 y 100 caracteres.');
  }
  return normalized;
}

function parseField(name: FieldName, value: unknown): OrganizationFields[FieldName] {
  switch (name) {
    case 'id_pais': return parseUuid(value, 'El país');
    case 'nombre': return requiredText(value, 'El nombre', 150);
    case 'nombre_representante': return requiredText(value, 'El nombre del representante', 150);
    case 'telefono': return phone(value);
    case 'correo': return email(value);
    case 'region_departamento': return requiredText(value, 'La región o departamento', 120);
    case 'comuna_municipio_ciudad': return requiredText(value, 'La comuna, municipio o ciudad', 120);
    case 'direccion': return requiredText(value, 'La dirección', 250);
    case 'publico_objetivo': return requiredText(value, 'El público objetivo', 500);
    case 'descripcion_breve': return requiredText(value, 'La descripción', 1000);
    case 'tipo_organizacion': return organizationType(value);
    case 'tipo_organizacion_otro': return otherType(value);
    case 'numero_beneficiarios': return beneficiaries(value);
  }
}

function validateOtherType(fields: Partial<OrganizationFields>): void {
  if (fields.tipo_organizacion === 'otra' && !fields.tipo_organizacion_otro) {
    invalid('Debes especificar el otro tipo de organización.');
  }
  if (fields.tipo_organizacion && fields.tipo_organizacion !== 'otra' && fields.tipo_organizacion_otro) {
    invalid('El otro tipo solo se utiliza cuando el tipo de organización es otra.');
  }
}

export function parseOrganizationFields(value: unknown): OrganizationFields {
  const input = objectInput(value, FIELD_NAMES);
  const result: Record<string, unknown> = {};
  for (const name of FIELD_NAMES) {
    if (name === 'tipo_organizacion_otro' && input[name] === undefined) continue;
    result[name] = parseField(name, input[name]);
  }
  validateOtherType(result as Partial<OrganizationFields>);
  return result as unknown as OrganizationFields;
}

export function parseUpdateInput(value: unknown): UpdateOrganizationInput {
  const input = objectInput(value, ['version_esperada', 'cambios']);
  const changesInput = objectInput(input.cambios, FIELD_NAMES);
  if (Object.keys(changesInput).length === 0) return invalid('Debes enviar al menos un campo para actualizar.');
  const changes: Record<string, unknown> = {};
  for (const [name, fieldValue] of Object.entries(changesInput)) {
    changes[name] = parseField(name as FieldName, fieldValue);
  }
  validateOtherType(changes as Partial<OrganizationFields>);

  let expectedVersion: number | undefined;
  if (input.version_esperada !== undefined) {
    if (typeof input.version_esperada !== 'number' || !Number.isInteger(input.version_esperada) || input.version_esperada < 1) {
      return invalid('La versión esperada debe ser un entero mayor que cero.');
    }
    expectedVersion = input.version_esperada;
  }
  return { changes: changes as Partial<OrganizationFields>, expectedVersion };
}

export function parseOrganizationFilters(url: URL): OrganizationFilters {
  const allowed = new Set(['id_pais', 'incluir_archivadas']);
  const extra = [...url.searchParams.keys()].find((key) => !allowed.has(key));
  if (extra) return invalid(`El filtro ${extra} no está permitido.`);
  const idPais = url.searchParams.get('id_pais') ?? undefined;
  const archived = url.searchParams.get('incluir_archivadas');
  if (archived !== null && archived !== 'true' && archived !== 'false') {
    return invalid('incluir_archivadas debe ser booleano.');
  }
  return {
    ...(idPais ? { idPais: parseUuid(idPais, 'El país') } : {}),
    includeArchived: archived === 'true',
  };
}
