import { booleanQuery, date, expectedVersion, invalid, objectInput, optionalText, requiredText, uuid } from './validation.ts';

export const ACTION_STATES = ['no_iniciada', 'en_desarrollo', 'atrasada', 'cancelada', 'cumplida'] as const;
export type ActionState = typeof ACTION_STATES[number];
export interface ActionPlanSummary { id_plan: string; id_organizacion: string; id_programa: string; nombre: string }
export interface InterventionAction {
  id_accion: string; id_plan: string; nombre: string; responsable_nombre: string;
  fecha_inicio: string; fecha_termino: string; estado: ActionState;
  observacion_motivo: string | null; resultado_esperado: string | null;
  created_at: string; updated_at: string; created_by: string | null; updated_by: string | null;
  archived_at: string | null; version: number; plan: ActionPlanSummary;
}
export interface ActionFields {
  id_plan: string; nombre: string; responsable_nombre: string; fecha_inicio: string;
  fecha_termino: string; estado: ActionState; observacion_motivo?: string | null;
  resultado_esperado?: string | null;
}
export interface ActionFilters { planId?: string; state?: ActionState; includeArchived: boolean }
export interface UpdateActionInput { expectedVersion?: number; changes: Partial<ActionFields> }
export interface ActionsRepository {
  list(token: string, filters: ActionFilters): Promise<InterventionAction[]>;
  getById(token: string, id: string): Promise<InterventionAction>;
  create(token: string, fields: ActionFields): Promise<InterventionAction>;
  update(token: string, id: string, input: UpdateActionInput): Promise<InterventionAction>;
}

const FIELDS = [
  'id_plan', 'nombre', 'responsable_nombre', 'fecha_inicio', 'fecha_termino',
  'estado', 'observacion_motivo', 'resultado_esperado',
] as const;
type Field = typeof FIELDS[number];

function state(value: unknown): ActionState {
  if (typeof value !== 'string' || !ACTION_STATES.includes(value as ActionState)) return invalid('El estado de la acción no es válido.');
  return value as ActionState;
}

function parseField(name: Field, value: unknown): ActionFields[Field] {
  switch (name) {
    case 'id_plan': return uuid(value, 'El plan');
    case 'nombre': return requiredText(value, 'El nombre', 150);
    case 'responsable_nombre': return requiredText(value, 'El responsable', 150);
    case 'fecha_inicio': return date(value, 'La fecha de inicio');
    case 'fecha_termino': return date(value, 'La fecha de término');
    case 'estado': return state(value);
    case 'observacion_motivo': return optionalText(value, 'La observación o motivo', 3000);
    case 'resultado_esperado': return optionalText(value, 'El resultado esperado', 5000);
  }
}

function validateRules(fields: Partial<ActionFields>): void {
  if (fields.fecha_inicio && fields.fecha_termino && fields.fecha_termino < fields.fecha_inicio) {
    invalid('La fecha de término no puede ser anterior a la fecha de inicio.');
  }
  if (fields.estado === 'cancelada' && !fields.observacion_motivo?.trim()) {
    invalid('Debes indicar el motivo cuando la acción está cancelada.');
  }
}

export function parseActionFields(value: unknown): ActionFields {
  const input = objectInput(value, FIELDS);
  const result: Record<string, unknown> = {};
  for (const name of FIELDS) {
    if (name === 'estado' && input[name] === undefined) result[name] = 'no_iniciada';
    else if ((name === 'observacion_motivo' || name === 'resultado_esperado') && input[name] === undefined) result[name] = null;
    else result[name] = parseField(name, input[name]);
  }
  validateRules(result as Partial<ActionFields>);
  return result as unknown as ActionFields;
}

export function parseActionUpdate(value: unknown): UpdateActionInput {
  const input = objectInput(value, ['version_esperada', 'cambios']);
  const rawChanges = objectInput(input.cambios, FIELDS);
  if (!Object.keys(rawChanges).length) return invalid('Debes enviar al menos un campo para actualizar.');
  const changes: Record<string, unknown> = {};
  for (const [name, fieldValue] of Object.entries(rawChanges)) changes[name] = parseField(name as Field, fieldValue);
  validateRules(changes as Partial<ActionFields>);
  return { changes: changes as Partial<ActionFields>, expectedVersion: expectedVersion(input.version_esperada) };
}

export function parseActionFilters(url: URL): ActionFilters {
  const allowed = new Set(['id_plan', 'estado', 'incluir_archivadas']);
  const extra = [...url.searchParams.keys()].find((key) => !allowed.has(key));
  if (extra) return invalid(`El filtro ${extra} no está permitido.`);
  const planId = url.searchParams.get('id_plan');
  const rawState = url.searchParams.get('estado');
  return {
    ...(planId ? { planId: uuid(planId, 'El plan') } : {}),
    ...(rawState ? { state: state(rawState) } : {}),
    includeArchived: booleanQuery(url.searchParams.get('incluir_archivadas'), 'incluir_archivadas'),
  };
}
