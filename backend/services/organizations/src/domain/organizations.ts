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

export const LEGAL_DOCUMENT_TYPES = [
  'identidad_representante',
  'identificacion_legal',
  'estatutos',
] as const;
export type LegalDocumentType = typeof LEGAL_DOCUMENT_TYPES[number];
export type LegalDocumentStatus = 'pendiente' | 'no_aplica' | 'cargado';

export interface LegalDocument {
  tipo: LegalDocumentType;
  estado: LegalDocumentStatus;
  nombre_archivo: string | null;
}

export interface LegalRecord {
  id_informacion_legal: string;
  id_organizacion: string;
  estado_personalidad_juridica: 'si' | 'no' | 'en_proceso';
  tipo_personalidad_juridica: '' | 'PJ' | 'ONG' | 'Fundación';
  numero_registro: string;
  fecha_constitucion: string;
  vigencia_directiva: string;
  version: number;
  updated_at: string;
  documentos: LegalDocument[];
}

export interface LegalFile {
  tipo: LegalDocumentType;
  nombre: string;
  mimeType: 'application/pdf';
  bytes: Uint8Array;
}

export interface SaveLegalRecordInput {
  fields: Omit<LegalRecord, 'id_informacion_legal' | 'id_organizacion' | 'version' | 'updated_at' | 'documentos'>;
  documents: Array<Pick<LegalDocument, 'tipo' | 'estado'>>;
  files: Partial<Record<LegalDocumentType, LegalFile>>;
  expectedVersion?: number;
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
  getLegalRecord(accessToken: string, organizationId: string): Promise<LegalRecord | null>;
  createLegalRecord(accessToken: string, organizationId: string, input: SaveLegalRecordInput): Promise<LegalRecord>;
  updateLegalRecord(accessToken: string, organizationId: string, input: SaveLegalRecordInput): Promise<LegalRecord>;
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

function optionalText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') return invalid(`${field} debe ser texto.`);
  const normalized = value.trim();
  if (normalized.length > maximum) return invalid(`${field} no puede superar ${maximum} caracteres.`);
  return normalized;
}

function parseLegalDate(value: unknown): string {
  const date = optionalText(value, 'La fecha de constitución', 10);
  if (!date) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return invalid('La fecha de constitución no es válida.');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== date) {
    return invalid('La fecha de constitución no es válida.');
  }
  if (date > new Date().toISOString().slice(0, 10)) return invalid('La fecha de constitución no puede ser futura.');
  return date;
}

async function parseLegalFile(value: FormDataEntryValue | null, tipo: LegalDocumentType): Promise<LegalFile | undefined> {
  if (!(value instanceof File) || value.size === 0 && !value.name) return undefined;
  if (!/\.pdf$/i.test(value.name) || (value.type && value.type !== 'application/pdf')) {
    return invalid('Solo se permiten documentos PDF.');
  }
  if (value.size < 5 || value.size > 10 * 1024 * 1024) {
    return invalid('Cada PDF debe contener datos y no puede superar 10 MB.');
  }
  const bytes = new Uint8Array(await value.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') {
    return invalid('El archivo recibido no contiene un PDF válido.');
  }
  return { tipo, nombre: value.name.slice(0, 255), mimeType: 'application/pdf', bytes };
}

export async function parseLegalRecordInput(form: FormData, update: boolean): Promise<SaveLegalRecordInput> {
  const raw = form.get('datos');
  if (typeof raw !== 'string') return invalid('Faltan los datos del expediente legal.');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return invalid('Los datos del expediente no contienen JSON válido.'); }
  const allowed = [
    'estado_personalidad_juridica', 'tipo_personalidad_juridica', 'numero_registro',
    'fecha_constitucion', 'vigencia_directiva', 'documentos', ...(update ? ['version_esperada'] : []),
  ];
  const input = objectInput(value, allowed);
  if (!['si', 'no', 'en_proceso'].includes(String(input.estado_personalidad_juridica))) {
    return invalid('Selecciona un estado de personalidad jurídica válido.');
  }
  if (!['', 'PJ', 'ONG', 'Fundación'].includes(String(input.tipo_personalidad_juridica))) {
    return invalid('El tipo de personalidad jurídica no es válido.');
  }
  if (!Array.isArray(input.documentos) || input.documentos.length !== LEGAL_DOCUMENT_TYPES.length) {
    return invalid('Debes indicar el estado de los tres documentos legales.');
  }
  const documents = input.documentos.map((value) => {
    const document = objectInput(value, ['tipo', 'estado']);
    if (!LEGAL_DOCUMENT_TYPES.includes(document.tipo as LegalDocumentType)) return invalid('El tipo de documento no es válido.');
    if (!['pendiente', 'no_aplica', 'cargado'].includes(String(document.estado))) return invalid('El estado del documento no es válido.');
    return { tipo: document.tipo as LegalDocumentType, estado: document.estado as LegalDocumentStatus };
  });
  if (new Set(documents.map(({ tipo }) => tipo)).size !== LEGAL_DOCUMENT_TYPES.length) {
    return invalid('Cada tipo de documento debe aparecer una sola vez.');
  }
  const files: Partial<Record<LegalDocumentType, LegalFile>> = {};
  for (const tipo of LEGAL_DOCUMENT_TYPES) {
    const file = await parseLegalFile(form.get(tipo), tipo);
    if (file) files[tipo] = file;
    const document = documents.find((item) => item.tipo === tipo)!;
    if (file && document.estado !== 'cargado') return invalid('Un PDF seleccionado debe quedar marcado como cargado.');
    if (!update && document.estado === 'cargado' && !file) return invalid('Un documento cargado requiere seleccionar su PDF.');
  }
  let expectedVersion: number | undefined;
  if (update) {
    if (typeof input.version_esperada !== 'number' || !Number.isInteger(input.version_esperada) || input.version_esperada < 1) {
      return invalid('La versión esperada debe ser un entero mayor que cero.');
    }
    expectedVersion = input.version_esperada;
  }
  return {
    fields: {
      estado_personalidad_juridica: input.estado_personalidad_juridica as SaveLegalRecordInput['fields']['estado_personalidad_juridica'],
      tipo_personalidad_juridica: input.tipo_personalidad_juridica as SaveLegalRecordInput['fields']['tipo_personalidad_juridica'],
      numero_registro: optionalText(input.numero_registro, 'El número de registro', 150),
      fecha_constitucion: parseLegalDate(input.fecha_constitucion),
      vigencia_directiva: optionalText(input.vigencia_directiva, 'La vigencia de la directiva', 300),
    },
    documents,
    files,
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  };
}
