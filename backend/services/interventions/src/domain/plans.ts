import { booleanQuery, date, expectedVersion, invalid, objectInput, requiredText, uuid } from './validation.ts';

export interface RelatedEntity { id: string; nombre: string }
export interface PlanOrganization extends RelatedEntity { id_pais: string }
export interface Plan {
  id_plan: string; id_organizacion: string; id_programa: string; nombre: string;
  situacion_necesidad: string; objetivo_general: string; objetivos_especificos: string;
  resultado_esperado: string; responsable_nombre: string; fecha_inicio: string; fecha_termino: string;
  periodo_anual: number;
  created_at: string; updated_at: string; created_by: string | null; updated_by: string | null;
  archived_at: string | null; version: number; organizacion: PlanOrganization; programa: RelatedEntity;
}
export interface PlanFields {
  id_organizacion: string; id_programa: string; nombre: string; situacion_necesidad: string;
  objetivo_general: string; objetivos_especificos: string; resultado_esperado: string;
  responsable_nombre: string; periodo_anual: number; fecha_inicio: string; fecha_termino: string;
}
export interface PlanFilters { organizationId?: string; programId?: string; annualPeriod?: number; includeArchived: boolean }
export interface UpdatePlanInput { expectedVersion?: number; changes: Partial<PlanFields> }
export interface PlansRepository {
  list(token: string, filters: PlanFilters): Promise<Plan[]>;
  getById(token: string, id: string): Promise<Plan>;
  create(token: string, fields: PlanFields): Promise<Plan>;
  update(token: string, id: string, input: UpdatePlanInput): Promise<Plan>;
  archive(token: string, id: string, expectedVersion: number): Promise<void>;
}

const FIELDS = [
  'id_organizacion', 'id_programa', 'nombre', 'situacion_necesidad', 'objetivo_general',
  'objetivos_especificos', 'resultado_esperado', 'responsable_nombre', 'fecha_inicio', 'fecha_termino',
  'periodo_anual',
] as const;
type Field = typeof FIELDS[number];

function parseField(name: Field, value: unknown): PlanFields[Field] {
  switch (name) {
    case 'id_organizacion': return uuid(value, 'La organización');
    case 'id_programa': return uuid(value, 'El programa');
    case 'nombre': return requiredText(value, 'El nombre', 150);
    case 'situacion_necesidad': return requiredText(value, 'La situación o necesidad', 5000);
    case 'objetivo_general': return requiredText(value, 'El objetivo general', 3000);
    case 'objetivos_especificos': return requiredText(value, 'Los objetivos específicos', 5000);
    case 'resultado_esperado': return requiredText(value, 'El resultado esperado', 5000);
    case 'responsable_nombre': return requiredText(value, 'El responsable', 150);
    case 'periodo_anual': {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 9999) {
        return invalid('El período anual debe ser un entero entre 1 y 9999.');
      }
      return value;
    }
    case 'fecha_inicio': return date(value, 'La fecha de inicio');
    case 'fecha_termino': return date(value, 'La fecha de término');
  }
}

function validateDates(fields: Partial<PlanFields>): void {
  if (fields.fecha_inicio && fields.fecha_termino && fields.fecha_termino < fields.fecha_inicio) {
    invalid('La fecha de término no puede ser anterior a la fecha de inicio.');
  }
}

export function parsePlanFields(value: unknown): PlanFields {
  const input = objectInput(value, FIELDS);
  const result: Record<string, unknown> = {};
  for (const name of FIELDS) result[name] = parseField(name, input[name]);
  validateDates(result as Partial<PlanFields>);
  return result as unknown as PlanFields;
}

export function parsePlanUpdate(value: unknown): UpdatePlanInput {
  const input = objectInput(value, ['version_esperada', 'cambios']);
  const rawChanges = objectInput(input.cambios, FIELDS);
  if (!Object.keys(rawChanges).length) return invalid('Debes enviar al menos un campo para actualizar.');
  const changes: Record<string, unknown> = {};
  for (const [name, fieldValue] of Object.entries(rawChanges)) changes[name] = parseField(name as Field, fieldValue);
  validateDates(changes as Partial<PlanFields>);
  return { changes: changes as Partial<PlanFields>, expectedVersion: expectedVersion(input.version_esperada) };
}

export function parsePlanFilters(url: URL): PlanFilters {
  const allowed = new Set(['id_organizacion', 'id_programa', 'periodo_anual', 'incluir_archivados']);
  const extra = [...url.searchParams.keys()].find((key) => !allowed.has(key));
  if (extra) return invalid(`El filtro ${extra} no está permitido.`);
  const organizationId = url.searchParams.get('id_organizacion');
  const programId = url.searchParams.get('id_programa');
  const rawAnnualPeriod = url.searchParams.get('periodo_anual');
  let annualPeriod: number | undefined;
  if (rawAnnualPeriod !== null) {
    annualPeriod = Number(rawAnnualPeriod);
    if (!Number.isInteger(annualPeriod) || annualPeriod < 1 || annualPeriod > 9999) {
      return invalid('El período anual debe ser un entero entre 1 y 9999.');
    }
  }
  return {
    ...(organizationId ? { organizationId: uuid(organizationId, 'La organización') } : {}),
    ...(programId ? { programId: uuid(programId, 'El programa') } : {}),
    ...(annualPeriod !== undefined ? { annualPeriod } : {}),
    includeArchived: booleanQuery(url.searchParams.get('incluir_archivados'), 'incluir_archivados'),
  };
}
