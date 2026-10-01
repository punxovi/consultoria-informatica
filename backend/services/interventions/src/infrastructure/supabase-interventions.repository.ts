import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { ActionFilters, ActionsRepository, InterventionAction, UpdateActionInput } from '../domain/actions.ts';
import type { Plan, PlanFilters, PlansRepository, UpdatePlanInput } from '../domain/plans.ts';

interface RepositoryOptions { supabaseUrl: string; anonKey: string; fetchImpl?: typeof fetch }

const PLAN_FIELDS = [
  'id_plan', 'id_organizacion', 'id_programa', 'nombre', 'situacion_necesidad',
  'objetivo_general', 'objetivos_especificos', 'resultado_esperado', 'responsable_nombre',
  'fecha_inicio', 'fecha_termino', 'created_at', 'updated_at', 'created_by', 'updated_by',
  'archived_at', 'version',
  'organizacion:organizaciones!planes_id_organizacion_fkey(id:id_organizacion,id_pais,nombre)',
  'programa:programas!planes_id_programa_fkey(id:id_programa,nombre)',
].join(',');

const ACTION_FIELDS = [
  'id_accion', 'id_plan', 'nombre', 'responsable_nombre', 'fecha_inicio', 'fecha_termino',
  'estado', 'observacion_motivo', 'resultado_esperado', 'created_at', 'updated_at',
  'created_by', 'updated_by', 'archived_at', 'version',
  'plan:planes!acciones_id_plan_fkey(id_plan,id_organizacion,id_programa,nombre)',
].join(',');

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function databaseError(kind: 'plan' | 'action', status: number, body: unknown): ServiceError {
  const detail = record(body);
  const code = typeof detail.code === 'string' ? detail.code : '';
  const details = `${detail.message ?? ''} ${detail.details ?? ''}`;
  if (code === '23503') {
    if (kind === 'action') return new ServiceError('PLAN_NO_EXISTE', 'El plan indicado no existe o ya no está disponible.', 409, detail);
    if (details.includes('id_organizacion')) return new ServiceError('ORGANIZACION_NO_EXISTE', 'La organización indicada no existe o ya no está disponible.', 409, detail);
    return new ServiceError('PROGRAMA_NO_EXISTE', 'El programa indicado no existe o ya no está disponible.', 409, detail);
  }
  if (['23502', '23514', '22007', '22P02'].includes(code)) {
    return new ServiceError(
      'RESTRICCION_INCUMPLIDA',
      kind === 'plan'
        ? 'Revisa las fechas y los campos obligatorios del plan.'
        : 'Revisa las fechas, el estado y los campos obligatorios de la acción.',
      400,
      detail,
    );
  }
  if (code === '42501' || status === 401 || status === 403) {
    return new ServiceError('SIN_PERMISO', `La sesión no tiene permiso para gestionar ${kind === 'plan' ? 'planes' : 'acciones'}.`, status === 401 ? 401 : 403, detail);
  }
  return new ServiceError('ERROR_BASE_DATOS', `No fue posible completar la operación de ${kind === 'plan' ? 'Planes' : 'Acciones'}.`, 502, detail);
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

export function createSupabaseInterventionsRepositories(options: RepositoryOptions): {
  plans: PlansRepository; actions: ActionsRepository;
} {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');

  async function request(kind: 'plan' | 'action', path: string, token: string, init: RequestInit = {}): Promise<unknown> {
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

  const plans: PlansRepository = {
    list(token, filters: PlanFilters) {
      const params = new URLSearchParams({ order: 'fecha_inicio.desc' });
      if (!filters.includeArchived) params.set('archived_at', 'is.null');
      if (filters.organizationId) params.set('id_organizacion', `eq.${filters.organizationId}`);
      if (filters.programId) params.set('id_programa', `eq.${filters.programId}`);
      return planRows(token, params);
    },
    async getById(token, id) {
      const rows = await planRows(token, new URLSearchParams({ id_plan: `eq.${id}`, archived_at: 'is.null', limit: '1' }));
      if (!rows[0]) throw new ServiceError('NO_ENCONTRADO', 'El plan solicitado no existe.', 404);
      return rows[0];
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

  return { plans, actions };
}

function unavailableRepositories(): { plans: PlansRepository; actions: ActionsRepository } {
  const unavailable = async (): Promise<never> => {
    throw new ServiceError('CONFIGURACION_SUPABASE', 'El servicio de Intervenciones no tiene configuradas SUPABASE_URL y SUPABASE_ANON_KEY.', 503);
  };
  return {
    plans: { list: unavailable, getById: unavailable, create: unavailable, update: unavailable },
    actions: { list: unavailable, getById: unavailable, create: unavailable, update: unavailable },
  };
}

export function createSupabaseInterventionsRepositoriesFromEnv() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return unavailableRepositories();
  return createSupabaseInterventionsRepositories({ supabaseUrl, anonKey });
}
