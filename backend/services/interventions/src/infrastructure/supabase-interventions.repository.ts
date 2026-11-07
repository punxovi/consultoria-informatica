import { withAuditFetch } from '../../../../shared/observability/src/audit-context.ts';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { readSupabaseConnection } from '../../../../shared/config/src/supabase.ts';
import type { ActionFilters, ActionsRepository, InterventionAction, UpdateActionInput } from '../domain/actions.ts';
import type {
  MeetingMinute,
  MeetingMinuteFilters,
  MeetingMinutesRepository,
  MeetingMinuteCatalog,
  UpdateMeetingMinuteInput,
} from '../domain/meeting-minutes.ts';
import type { Plan, PlanFilters, PlansRepository, UpdatePlanInput } from '../domain/plans.ts';

interface RepositoryOptions { supabaseUrl: string; anonKey: string; fetchImpl?: typeof fetch }

const PLAN_FIELDS = [
  'id_plan', 'id_organizacion', 'id_programa', 'nombre', 'situacion_necesidad',
  'objetivo_general', 'objetivos_especificos', 'resultado_esperado', 'responsable_nombre',
  'periodo_anual', 'fecha_inicio', 'fecha_termino', 'created_at', 'updated_at', 'created_by', 'updated_by',
  'archived_at', 'version',
  'organizacion:organizaciones!planes_id_organizacion_fkey(id:id_organizacion,id_pais,nombre)',
  'programa:programas!planes_id_programa_fkey(id:id_programa,nombre)',
].join(',');

const ACTION_FIELDS = [
  'id_accion', 'id_plan', 'nombre', 'responsable_nombre', 'fecha_inicio', 'fecha_termino',
  'estado', 'descripcion', 'observacion_motivo', 'resultado_esperado', 'created_at', 'updated_at',
  'created_by', 'updated_by', 'archived_at', 'version',
  'plan:planes!acciones_id_plan_fkey(id_plan,id_organizacion,id_programa,nombre)',
].join(',');

const MEETING_MINUTE_FIELDS = [
  'id_acta', 'id_organizacion', 'id_plan', 'id_accion', 'objetivo', 'fecha_reunion',
  'asistentes', 'asistentes_externos', 'observaciones', 'created_at', 'updated_at',
  'created_by', 'updated_by', 'archived_at', 'version',
  'compromisos(id_compromiso,descripcion,responsable_nombre,responsable_contacto,fecha_limite,observaciones,estado)',
].join(',');

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

type ResourceKind = 'plan' | 'action' | 'meeting-minute';

function databaseError(kind: ResourceKind, status: number, body: unknown): ServiceError {
  const detail = record(body);
  const code = typeof detail.code === 'string' ? detail.code : '';
  const details = `${detail.message ?? ''} ${detail.details ?? ''}`;
  if (code === 'P0002') return new ServiceError('NO_ENCONTRADA', 'La organización o el acta solicitada no existe o no está disponible.', 404, detail);
  if (code === '23503') {
    if (kind === 'meeting-minute') {
      if (details.includes('id_organizacion')) return new ServiceError('ORGANIZACION_NO_EXISTE', 'La organización indicada no existe.', 409, detail);
      if (details.includes('id_accion')) return new ServiceError('ACCION_NO_EXISTE', 'La acción indicada no existe o no pertenece al plan.', 409, detail);
      return new ServiceError('PLAN_NO_EXISTE', 'El plan indicado no existe o no pertenece a la organización.', 409, detail);
    }
    if (kind === 'action') return new ServiceError('PLAN_NO_EXISTE', 'El plan indicado no existe o ya no está disponible.', 409, detail);
    if (details.includes('id_organizacion')) return new ServiceError('ORGANIZACION_NO_EXISTE', 'La organización indicada no existe o ya no está disponible.', 409, detail);
    return new ServiceError('PROGRAMA_NO_EXISTE', 'El programa indicado no existe o ya no está disponible.', 409, detail);
  }
  if (['23502', '23514', '22007', '22P02'].includes(code)) {
    return new ServiceError(
      'RESTRICCION_INCUMPLIDA',
      kind === 'plan'
        ? 'Revisa las fechas y los campos obligatorios del plan.'
        : kind === 'action'
          ? 'Revisa las fechas, el estado y los campos obligatorios de la acción.'
          : 'Revisa los campos obligatorios y relaciones del acta.',
      400,
      detail,
    );
  }
  if (code === '40001') {
    return new ServiceError(
      'CONFLICTO_CONCURRENCIA',
      'El registro cambió o ya fue eliminado. Recarga antes de volver a intentarlo.',
      409,
      detail,
    );
  }
  if (code === '42501' || status === 401 || status === 403) {
    const resource = kind === 'plan' ? 'planes' : kind === 'action' ? 'acciones' : 'actas';
    return new ServiceError('SIN_PERMISO', `La sesión no tiene permiso para gestionar ${resource}.`, status === 401 ? 401 : 403, detail);
  }
  const resource = kind === 'plan' ? 'Planes' : kind === 'action' ? 'Acciones' : 'Actas';
  return new ServiceError('ERROR_BASE_DATOS', `No fue posible completar la operación de ${resource}.`, 502, detail);
}

function plan(value: unknown): Plan {
  const data = record(value);
  if (typeof data.id_plan !== 'string' || typeof data.nombre !== 'string' || !data.organizacion || !data.programa) {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió un plan inválido.', 502);
  }
  return data as unknown as Plan;
}

function action(value: unknown): InterventionAction {
  const data = record(value);
  if (typeof data.id_accion !== 'string' || typeof data.nombre !== 'string' || !data.plan) {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una acción inválida.', 502);
  }
  return data as unknown as InterventionAction;
}

function meetingMinute(value: unknown): MeetingMinute {
  const data = record(value);
  if (
    typeof data.id_acta !== 'string' || typeof data.id_organizacion !== 'string' ||
    typeof data.id_plan !== 'string' || typeof data.objetivo !== 'string' ||
    typeof data.fecha_reunion !== 'string' || !Array.isArray(data.asistentes)
  ) {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió un acta inválida.', 502);
  }
  // El esquema histórico almacena timestamptz; el contrato de Actas usa fecha civil.
  return { ...data, fecha_reunion: data.fecha_reunion.slice(0, 10) } as unknown as MeetingMinute;
}

export function createSupabaseInterventionsRepositories(options: RepositoryOptions): {
  plans: PlansRepository; actions: ActionsRepository; meetingMinutes: MeetingMinutesRepository;
} {
  const fetchImpl = withAuditFetch(options.fetchImpl ?? fetch, options.supabaseUrl);
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');

  async function request(kind: ResourceKind, path: string, token: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
        ...init,
        headers: {
          apikey: options.anonKey,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          ...init.headers,
        },
      });
    } catch (error) {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible conectar con la base de datos.', 503, error);
    }
    let body: unknown = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) throw databaseError(kind, response.status, body);
    return body;
  }

  async function planRows(token: string, params: URLSearchParams, init?: RequestInit): Promise<Plan[]> {
    params.set('select', PLAN_FIELDS);
    const body = await request('plan', `planes?${params}`, token, init);
    if (!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió planes inválidos.', 502);
    return body.map(plan);
  }

  async function actionRows(token: string, params: URLSearchParams, init?: RequestInit): Promise<InterventionAction[]> {
    params.set('select', ACTION_FIELDS);
    const body = await request('action', `acciones?${params}`, token, init);
    if (!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió acciones inválidas.', 502);
    return body.map(action);
  }

  async function meetingMinuteRows(token: string, params: URLSearchParams, init?: RequestInit): Promise<MeetingMinute[]> {
    params.set('select', MEETING_MINUTE_FIELDS);
    const body = await request('meeting-minute', `actas?${params}`, token, init);
    if (!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió actas inválidas.', 502);
    return body.map(meetingMinute);
  }

  async function getMeetingMinuteById(token: string, id: string): Promise<MeetingMinute> {
    const rows = await meetingMinuteRows(token, new URLSearchParams({
      id_acta: `eq.${id}`, archived_at: 'is.null', limit: '1',
    }));
    if (!rows[0]) throw new ServiceError('NO_ENCONTRADA', 'El acta solicitada no existe.', 404);
    return rows[0];
  }

  async function relationExists(token: string, table: string, params: URLSearchParams): Promise<boolean> {
    params.set('select', table === 'organizaciones' ? 'id_organizacion' : table === 'planes' ? 'id_plan' : 'id_accion');
    params.set('archived_at', 'is.null');
    params.set('limit', '1');
    const body = await request('meeting-minute', `${table}?${params}`, token);
    if (!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA', 'No fue posible validar las relaciones del acta.', 502);
    return body.length > 0;
  }

  async function validateMeetingMinuteRelations(
    token: string,
    organizationId: string,
    planId: string,
    actionId?: string | null,
  ): Promise<void> {
    const organizationExists = await relationExists(token, 'organizaciones', new URLSearchParams({
      id_organizacion: `eq.${organizationId}`,
    }));
    if (!organizationExists) throw new ServiceError('ORGANIZACION_NO_EXISTE', 'La organización indicada no existe o no está disponible.', 409);
    const planExists = await relationExists(token, 'planes', new URLSearchParams({
      id_plan: `eq.${planId}`, id_organizacion: `eq.${organizationId}`,
    }));
    if (!planExists) throw new ServiceError('PLAN_NO_CORRESPONDE', 'El plan no existe o no pertenece a la organización.', 409);
    if (actionId) {
      const actionExists = await relationExists(token, 'acciones', new URLSearchParams({
        id_accion: `eq.${actionId}`, id_plan: `eq.${planId}`,
      }));
      if (!actionExists) throw new ServiceError('ACCION_NO_CORRESPONDE', 'La acción no existe o no pertenece al plan.', 409);
    }
  }

  async function archiveRecord(kind: 'plan' | 'action', token: string, id: string, version: number): Promise<void> {
    await request(kind, `rpc/archivar_${kind === 'plan' ? 'plan' : 'accion'}_seguro`, token, {
      method: 'POST',
      headers: { prefer: 'return=minimal' },
      body: JSON.stringify({ p_id: id, p_version: version }),
    });
  }

  const plans: PlansRepository = {
    list(token, filters: PlanFilters) {
      const params = new URLSearchParams({ order: 'fecha_inicio.desc' });
      if (!filters.includeArchived) params.set('archived_at', 'is.null');
      if (filters.organizationId) params.set('id_organizacion', `eq.${filters.organizationId}`);
      if (filters.programId) params.set('id_programa', `eq.${filters.programId}`);
      if (filters.annualPeriod !== undefined) params.set('periodo_anual', `eq.${filters.annualPeriod}`);
      return planRows(token, params);
    },
    async getById(token, id) {
      const rows = await planRows(token, new URLSearchParams({ id_plan: `eq.${id}`, archived_at: 'is.null', limit: '1' }));
      if (!rows[0]) throw new ServiceError('NO_ENCONTRADO', 'El plan solicitado no existe.', 404);
      return rows[0];
    },
    archive(token, id, version) {
      return archiveRecord('plan', token, id, version);
    },
    async create(token, fields) {
      const rows = await planRows(token, new URLSearchParams(), {
        method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(fields),
      });
      if (!rows[0]) throw new ServiceError('ERROR_BASE_DATOS', 'No fue posible crear el plan.', 502);
      return rows[0];
    },
    async update(token, id, input: UpdatePlanInput) {
      const params = new URLSearchParams({ id_plan: `eq.${id}`, archived_at: 'is.null' });
      if (input.expectedVersion !== undefined) params.set('version', `eq.${input.expectedVersion}`);
      const rows = await planRows(token, params, {
        method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(input.changes),
      });
      if (!rows[0]) throw new ServiceError(
        input.expectedVersion === undefined ? 'NO_ENCONTRADO' : 'CONFLICTO_CONCURRENCIA',
        input.expectedVersion === undefined ? 'El plan solicitado no existe.' : 'El plan fue modificado por otra sesión. Recarga los datos antes de guardar.',
        input.expectedVersion === undefined ? 404 : 409,
      );
      return rows[0];
    },
  };

  const actions: ActionsRepository = {
    list(token, filters: ActionFilters) {
      const params = new URLSearchParams({ order: 'fecha_inicio.asc' });
      if (!filters.includeArchived) params.set('archived_at', 'is.null');
      if (filters.planId) params.set('id_plan', `eq.${filters.planId}`);
      if (filters.state) params.set('estado', `eq.${filters.state}`);
      return actionRows(token, params);
    },
    async getById(token, id) {
      const rows = await actionRows(token, new URLSearchParams({ id_accion: `eq.${id}`, archived_at: 'is.null', limit: '1' }));
      if (!rows[0]) throw new ServiceError('NO_ENCONTRADA', 'La acción solicitada no existe.', 404);
      return rows[0];
    },
    async create(token, fields) {
      const rows = await actionRows(token, new URLSearchParams(), {
        method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(fields),
      });
      if (!rows[0]) throw new ServiceError('ERROR_BASE_DATOS', 'No fue posible crear la acción.', 502);
      return rows[0];
    },
    archive(token, id, version) {
      return archiveRecord('action', token, id, version);
    },
    async update(token, id, input: UpdateActionInput) {
      const params = new URLSearchParams({ id_accion: `eq.${id}`, archived_at: 'is.null' });
      if (input.expectedVersion !== undefined) params.set('version', `eq.${input.expectedVersion}`);
      const rows = await actionRows(token, params, {
        method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(input.changes),
      });
      if (!rows[0]) throw new ServiceError(
        input.expectedVersion === undefined ? 'NO_ENCONTRADA' : 'CONFLICTO_CONCURRENCIA',
        input.expectedVersion === undefined ? 'La acción solicitada no existe.' : 'La acción fue modificada por otra sesión. Recarga los datos antes de guardar.',
        input.expectedVersion === undefined ? 404 : 409,
      );
      return rows[0];
    },
  };

  const meetingMinutes: MeetingMinutesRepository = {
    async catalog(token, organizationId) {
      const data = await request('meeting-minute', 'rpc/catalogo_actas', token, {
        method: 'POST', body: JSON.stringify({ p_id_organizacion: organizationId }),
      });
      if (!Array.isArray(record(data).planes) || !Array.isArray(record(data).acciones) || !Array.isArray(record(data).asistentes) || typeof record(data).puede_gestionar !== 'boolean') {
        throw new ServiceError('RESPUESTA_INVALIDA', 'No fue posible consultar las opciones del acta.', 502);
      }
      return data as MeetingMinuteCatalog;
    },
    async list(token, filters: MeetingMinuteFilters) {
      if (filters.organizationId && !await relationExists(token, 'organizaciones', new URLSearchParams({ id_organizacion: `eq.${filters.organizationId}` }))) {
        throw new ServiceError('NO_ENCONTRADA', 'La organización solicitada no existe o no está disponible.', 404);
      }
      const params = new URLSearchParams({ order: 'fecha_reunion.desc,id_acta.desc' });
      if (!filters.includeArchived) params.set('archived_at', 'is.null');
      if (filters.organizationId) params.set('id_organizacion', `eq.${filters.organizationId}`);
      if (filters.planId) params.set('id_plan', `eq.${filters.planId}`);
      if (filters.actionId) params.set('id_accion', `eq.${filters.actionId}`);
      return meetingMinuteRows(token, params);
    },
    getById: getMeetingMinuteById,
    async create(token, input) {
      await validateMeetingMinuteRelations(token, input.id_organizacion, input.id_plan, input.id_accion);
      const { compromisos = [], ...fields } = input;
      if (compromisos.length) {
        return meetingMinute(await request('meeting-minute', 'rpc/crear_acta_completa', token, {
          method: 'POST', body: JSON.stringify({ p_datos: fields, p_compromisos: compromisos }),
        }));
      }
      const rows = await meetingMinuteRows(token, new URLSearchParams(), {
        method: 'POST', headers: { prefer: 'return=representation' }, body: JSON.stringify(fields),
      });
      if (!rows[0]) throw new ServiceError('ERROR_BASE_DATOS', 'No fue posible registrar el acta.', 502);
      return rows[0];
    },
    async update(token, id, input: UpdateMeetingMinuteInput) {
      const current = await getMeetingMinuteById(token, id);
      const planId = input.changes.id_plan ?? current.id_plan;
      const actionId = Object.hasOwn(input.changes, 'id_accion') ? input.changes.id_accion : current.id_accion;
      await validateMeetingMinuteRelations(token, current.id_organizacion, planId, actionId);
      const rows = await meetingMinuteRows(token, new URLSearchParams({
        id_acta: `eq.${id}`, archived_at: 'is.null', version: `eq.${input.expectedVersion}`,
      }), {
        method: 'PATCH', headers: { prefer: 'return=representation' }, body: JSON.stringify(input.changes),
      });
      if (!rows[0]) throw new ServiceError(
        'CONFLICTO_CONCURRENCIA',
        'El acta fue modificada por otra sesión. Recarga los datos antes de guardar.',
        409,
      );
      return rows[0];
    },
  };

  return { plans, actions, meetingMinutes };
}

function unavailableRepositories(): { plans: PlansRepository; actions: ActionsRepository; meetingMinutes: MeetingMinutesRepository } {
  const unavailable = async (): Promise<never> => {
    throw new ServiceError('CONFIGURACION_SUPABASE', 'El servicio de Intervenciones no tiene configuradas SUPABASE_URL y SUPABASE_ANON_KEY.', 503);
  };
  return {
    plans: { list: unavailable, getById: unavailable, create: unavailable, update: unavailable, archive: unavailable },
    actions: { list: unavailable, getById: unavailable, create: unavailable, update: unavailable, archive: unavailable },
    meetingMinutes: { catalog: unavailable, list: unavailable, getById: unavailable, create: unavailable, update: unavailable },
  };
}

export function createSupabaseInterventionsRepositoriesFromEnv() {
  const { supabaseUrl, anonKey } = readSupabaseConnection();
  if (!supabaseUrl || !anonKey) return unavailableRepositories();
  return createSupabaseInterventionsRepositories({ supabaseUrl, anonKey });
}
