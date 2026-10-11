import { ServiceError } from '../../../../shared/errors/src/index.ts';
import { randomUUID } from 'node:crypto';
import type {
  CountrySummary,
  Organization,
  OrganizationFields,
  OrganizationFilters,
  OrganizationsRepository,
  LegalDocument,
  LegalDocumentType,
  LegalRecord,
  SaveLegalRecordInput,
  Diagnostico,
  CamposDiagnostico,
} from '../domain/organizations.ts';
import { LEGAL_DOCUMENT_TYPES } from '../domain/organizations.ts';
import type { Compromiso } from '../domain/compromisos.ts';

interface RepositoryOptions {
  supabaseUrl: string;
  anonKey: string;
  fetchImpl?: typeof fetch;
}

const ORGANIZATION_FIELDS = [
  'id_organizacion', 'id_pais', 'nombre', 'nombre_representante', 'telefono',
  'correo', 'region_departamento', 'comuna_municipio_ciudad', 'direccion',
  'publico_objetivo', 'descripcion_breve', 'tipo_organizacion',
  'tipo_organizacion_otro', 'numero_beneficiarios', 'created_at', 'updated_at',
  'created_by', 'updated_by', 'archived_at', 'version',
  'pais:paises!organizaciones_id_pais_fkey(id_pais,codigo_iso,nombre)',
].join(',');

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function commitment(value: unknown, orgId: string): Compromiso {
  const data=record(value);
  if(typeof data.id_compromiso !== 'string' || data.id_organizacion !== orgId || typeof data.id_acta !== 'string' || typeof data.version !== 'number') {
    throw new ServiceError('RESPUESTA_INVALIDA','La base de datos devolvió un compromiso inválido.',502);
  }
  return data as unknown as Compromiso;
}

function postgrestError(status: number, body: unknown): ServiceError {
  const detail = record(body);
  const code = typeof detail.code === 'string' ? detail.code : '';
  if (code === '23503') {
    return new ServiceError('PAIS_NO_EXISTE', 'El país indicado no existe o ya no está disponible.', 409, detail);
  }
  if (code === 'P0002') return new ServiceError('NO_ENCONTRADO', 'El registro solicitado no existe.', 404, detail);
  if (code === '40001') return new ServiceError('CONFLICTO_CONCURRENCIA', 'El registro fue modificado por otra sesión. Recarga antes de guardar.', 409, detail);
  if (code === '23505') return new ServiceError('EXPEDIENTE_EXISTENTE', 'La Organización ya posee un registro legal.', 409, detail);
  if (['23502', '23514', '22P02'].includes(code)) {
    return new ServiceError('RESTRICCION_INCUMPLIDA', 'La organización o elemento no cumple las restricciones de la base de datos.', 400, detail);
  }
  if (code === '42501' || status === 401 || status === 403) {
    return new ServiceError('SIN_PERMISO', 'La sesión no tiene permiso para realizar esta operación.', status === 401 ? 401 : 403, detail);
  }
  return new ServiceError('ERROR_BASE_DATOS', 'No fue posible completar la operación en la base de datos.', 502, detail);
}

function legalRecord(value: unknown): LegalRecord {
  const data = record(value);
  if (typeof data.id_informacion_legal !== 'string' || typeof data.id_organizacion !== 'string'
      || typeof data.version !== 'number' || typeof data.updated_at !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió un expediente legal inválido.', 502);
  }
  const rawDocuments = Array.isArray(data.documentos) ? data.documentos : [];
  const documents: LegalDocument[] = LEGAL_DOCUMENT_TYPES.map((tipo) => {
    const raw = record(rawDocuments.find((item) => record(item).tipo === tipo));
    const status = ['pendiente', 'no_aplica', 'cargado'].includes(String(raw.estado))
      ? raw.estado as LegalDocument['estado']
      : 'pendiente';
    const archive = record(raw.archivo);
    return {
      tipo,
      estado: status,
      nombre_archivo: status === 'cargado' && typeof archive.nombre_original === 'string'
        ? archive.nombre_original
        : null,
    };
  });
  return {
    id_informacion_legal: data.id_informacion_legal,
    id_organizacion: data.id_organizacion,
    estado_personalidad_juridica: data.estado_personalidad_juridica as LegalRecord['estado_personalidad_juridica'],
    tipo_personalidad_juridica: (data.tipo_personalidad_juridica ?? '') as LegalRecord['tipo_personalidad_juridica'],
    numero_registro: typeof data.numero_registro === 'string' ? data.numero_registro : '',
    fecha_constitucion: typeof data.fecha_constitucion === 'string' ? data.fecha_constitucion : '',
    vigencia_directiva: typeof data.vigencia_directiva === 'string' ? data.vigencia_directiva : '',
    version: data.version,
    updated_at: data.updated_at,
    documentos: documents,
  };
}

function organization(value: unknown): Organization {
  const data = record(value);
  if (typeof data.id_organizacion !== 'string' || typeof data.nombre !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una organización inválida.', 502);
  }
  return data as unknown as Organization;
}

function country(value: unknown): CountrySummary {
  const data = record(value);
  if (typeof data.id_pais !== 'string' || typeof data.codigo_iso !== 'string' || typeof data.nombre !== 'string') {
    throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió un país inválido.', 502);
  }
  return data as unknown as CountrySummary;
}

export function createSupabaseOrganizationsRepository(options: RepositoryOptions): OrganizationsRepository {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.supabaseUrl.replace(/\/$/, '');

  async function request(
    table: string,
    accessToken: string,
    params: URLSearchParams,
    init: RequestInit = {},
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/rest/v1/${table}?${params}`, {
        ...init,
        headers: {
          apikey: options.anonKey,
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          ...init.headers,
        },
      });
    } catch (error) {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible conectar con la base de datos.', 503, error);
    }

    let body: unknown = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      if(table.endsWith('_compromisos') || table === 'rpc/guardar_compromiso') {
        if(record(body).code === '23503') throw new ServiceError('ACTA_NO_CORRESPONDE','El acta no existe o no pertenece a esta organización.',409,body);
        if(['23502','23514','22007','22008','22P02'].includes(String(record(body).code))) {
          throw new ServiceError('DATOS_INVALIDOS','Revisa el acuerdo, responsable, contacto, fecha y estado del compromiso.',400,body);
        }
      }
      if (table === 'diagnosticos' && record(body).code === '23505') {
        throw new ServiceError('DIAGNOSTICO_EXISTENTE', 'La organización ya tiene un diagnóstico. Recarga los datos para editarlo.', 409);
      }
      if (table === 'diagnosticos' && record(body).code === '23503') {
        throw new ServiceError('NO_ENCONTRADO', 'La organización solicitada no existe o ya no está disponible.', 404);
      }
      throw postgrestError(response.status, body);
    }
    return body;
  }

  async function organizationRows(
    accessToken: string,
    params: URLSearchParams,
    init?: RequestInit,
  ): Promise<Organization[]> {
    params.set('select', ORGANIZATION_FIELDS);
    const body = await request('organizaciones', accessToken, params, init);
    if (!Array.isArray(body)) {
      throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una respuesta inválida.', 502);
    }
    return body.map(organization);
  }

  async function getLegalRecord(accessToken: string, organizationId: string): Promise<LegalRecord | null> {
    await organizationRows(accessToken, new URLSearchParams({
      id_organizacion: `eq.${organizationId}`, archived_at: 'is.null', limit: '1',
    })).then((rows) => {
      if (!rows[0]) throw new ServiceError('NO_ENCONTRADA', 'La organización solicitada no existe.', 404);
    });
    const params = new URLSearchParams({
      select: [
        'id_informacion_legal', 'id_organizacion', 'estado_personalidad_juridica',
        'tipo_personalidad_juridica', 'numero_registro', 'fecha_constitucion',
        'vigencia_directiva', 'version', 'updated_at',
        'documentos:documentos_informacion_legal(tipo,estado,archivo:archivos(nombre_original))',
      ].join(','),
      id_organizacion: `eq.${organizationId}`,
      archived_at: 'is.null',
      limit: '1',
    });
    const body = await request('informacion_legal', accessToken, params);
    if (!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una respuesta inválida.', 502);
    return body[0] ? legalRecord(body[0]) : null;
  }

  async function storageRequest(
    accessToken: string,
    path: string,
    init: RequestInit,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/storage/v1/object/fge-expedientes-legales/${path}`, {
        ...init,
        headers: {
          apikey: options.anonKey,
          authorization: `Bearer ${accessToken}`,
          ...init.headers,
        },
      });
    } catch (error) {
      throw new ServiceError('SUPABASE_NO_DISPONIBLE', 'No fue posible conectar con el almacenamiento.', 503, error);
    }
    if (!response.ok) {
      let body: unknown = null;
      try { body = await response.json(); } catch { body = null; }
      throw postgrestError(response.status, body);
    }
  }

  async function saveLegalRecord(
    accessToken: string,
    organizationId: string,
    input: SaveLegalRecordInput,
  ): Promise<LegalRecord> {
    const uploaded: string[] = [];
    const documents: Array<Record<string, unknown>> = [];
    try {
      for (const document of input.documents) {
        const file = input.files[document.tipo];
        let archive: Record<string, unknown> | undefined;
        if (file) {
          const path = `expedientes/${organizationId}/${document.tipo}/${randomUUID()}.pdf`;
          await storageRequest(accessToken, path, {
            method: 'POST',
            headers: { 'content-type': 'application/pdf', 'x-upsert': 'false' },
            body: file.bytes,
          });
          uploaded.push(path);
          archive = {
            ruta_objeto: path,
            nombre_original: file.nombre,
            mime_type: file.mimeType,
            tamano_bytes: file.bytes.byteLength,
          };
        }
        documents.push({ ...document, ...(archive ? { archivo: archive } : {}) });
      }
      await request('rpc/guardar_expediente_legal', accessToken, new URLSearchParams(), {
        method: 'POST',
        body: JSON.stringify({
          p_id_organizacion: organizationId,
          p_datos: { ...input.fields, documentos: documents },
          p_version_esperada: input.expectedVersion ?? null,
        }),
      });
    } catch (error) {
      await Promise.allSettled(uploaded.map((path) => storageRequest(accessToken, path, { method: 'DELETE' })));
      throw error;
    }
    const saved = await getLegalRecord(accessToken, organizationId);
    if (!saved) throw new ServiceError('ERROR_BASE_DATOS', 'El expediente se guardó pero no pudo consultarse.', 502);
    return saved;
  }

  return {
    async list(accessToken, filters) {
      const params = new URLSearchParams({ order: 'nombre.asc' });
      if (!filters.includeArchived) params.set('archived_at', 'is.null');
      if (filters.idPais) params.set('id_pais', `eq.${filters.idPais}`);
      return organizationRows(accessToken, params);
    },

    async getById(accessToken, id) {
      const rows = await organizationRows(accessToken, new URLSearchParams({
        id_organizacion: `eq.${id}`,
        archived_at: 'is.null',
        limit: '1',
      }));
      if (!rows[0]) throw new ServiceError('NO_ENCONTRADA', 'La organización solicitada no existe.', 404);
      return rows[0];
    },

    async create(accessToken, fields) {
      const rows = await organizationRows(accessToken, new URLSearchParams(), {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify(fields),
      });
      if (!rows[0]) throw new ServiceError('ERROR_BASE_DATOS', 'No fue posible crear la organización.', 502);
      return rows[0];
    },

    async update(accessToken, id, changes, expectedVersion) {
      const params = new URLSearchParams({
        id_organizacion: `eq.${id}`,
        archived_at: 'is.null',
      });
      if (expectedVersion !== undefined) params.set('version', `eq.${expectedVersion}`);
      const rows = await organizationRows(accessToken, params, {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify(changes),
      });
      if (!rows[0]) {
        throw new ServiceError(
          expectedVersion === undefined ? 'NO_ENCONTRADA' : 'CONFLICTO_CONCURRENCIA',
          expectedVersion === undefined
            ? 'La organización solicitada no existe.'
            : 'La organización fue modificada por otra sesión.',
          expectedVersion === undefined ? 404 : 409,
        );
      }
      return rows[0];
    },

    async listCountries(accessToken) {
      const body = await request('paises', accessToken, new URLSearchParams({
        select: 'id_pais,codigo_iso,nombre',
        archived_at: 'is.null',
        order: 'nombre.asc',
      }));
      if (!Array.isArray(body)) {
        throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una respuesta inválida.', 502);
      }
      return body.map(country);
    },

    getLegalRecord,

    createLegalRecord(accessToken, organizationId, input) {
      return saveLegalRecord(accessToken, organizationId, { ...input, expectedVersion: undefined });
    },

    updateLegalRecord(accessToken, organizationId, input) {
      return saveLegalRecord(accessToken, organizationId, input);
    },

    async listCommitments(accessToken, orgId, filtros) {
      const body = await request('rpc/consultar_compromisos',accessToken,new URLSearchParams(),{
        method:'POST',body:JSON.stringify({p_id_organizacion:orgId,p_id_acta:filtros.id_acta ?? null}),
      });
      if(!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA','La lista de compromisos recibida no es válida.',502);
      return body;
    },
    async listCommitmentOrigins(accessToken, orgId) {
      const body = await request('rpc/catalogo_compromisos',accessToken,new URLSearchParams(),{
        method:'POST',body:JSON.stringify({p_id_organizacion:orgId}),
      });
      if(!Array.isArray(record(body).actas) || typeof record(body).puede_gestionar !== 'boolean') {
        throw new ServiceError('RESPUESTA_INVALIDA','Las actas de origen recibidas no son válidas.',502);
      }
      return body as import('../domain/compromisos.ts').OrigenesCompromisos;
    },
    async createCommitment(accessToken, orgId, fields) {
      const body = await request('rpc/guardar_compromiso',accessToken,new URLSearchParams(),{
        method:'POST',body:JSON.stringify({p_id_organizacion:orgId,p_datos:fields}),
      });
      return commitment(body,orgId);
    },
    async getCommitmentById(accessToken, orgId, commitmentId) {
      const body = await request('rpc/consultar_compromisos',accessToken,new URLSearchParams(),{
        method:'POST',body:JSON.stringify({p_id_organizacion:orgId,p_id:commitmentId}),
      });
      if(!Array.isArray(body)) throw new ServiceError('RESPUESTA_INVALIDA','El compromiso recibido no es válido.',502);
      if(!body[0]) throw new ServiceError('NO_ENCONTRADO','El compromiso solicitado no existe o no está disponible.',404);
      return commitment(body[0],orgId);
    },
    async updateCommitment(accessToken, orgId, commitmentId, changes, expectedVersion) {
      const body = await request('rpc/guardar_compromiso',accessToken,new URLSearchParams(),{
        method:'POST',body:JSON.stringify({p_id_organizacion:orgId,p_id:commitmentId,p_version:expectedVersion,p_datos:changes}),
      });
      return commitment(body,orgId);
    },
    async listDiagnosticos(accessToken, orgId) {
      await this.getById(accessToken, orgId);
      const params = new URLSearchParams({
        id_organizacion: `eq.${orgId}`,
        archived_at: 'is.null',
        order: 'created_at.desc',
      });
      const body = await request('diagnosticos', accessToken, params);
      if (!Array.isArray(body)) {
        throw new ServiceError('RESPUESTA_INVALIDA', 'La base de datos devolvió una respuesta inválida.', 502);
      }
      return body;
    },

    async createDiagnostico(accessToken, orgId, fields) {
      await this.getById(accessToken, orgId);
      const body = await request('diagnosticos', accessToken, new URLSearchParams(), {
        method: 'POST',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify({
          id_organizacion: orgId,
          ...fields,
        }),
      });
      const rows = Array.isArray(body) ? body : [];
      if (!rows[0]) {
        throw new ServiceError('ERROR_BASE_DATOS', 'No fue posible crear el diagnóstico.', 502);
      }
      return rows[0];
    },

    async getDiagnosticoById(accessToken, orgId, diagnosticoId) {
      const params = new URLSearchParams({
        id_diagnostico: `eq.${diagnosticoId}`,
        id_organizacion: `eq.${orgId}`,
        archived_at: 'is.null',
        limit: '1',
      });
      const body = await request('diagnosticos', accessToken, params);
      const rows = Array.isArray(body) ? body : [];
      if (!rows[0]) {
        throw new ServiceError('NO_ENCONTRADO', 'El diagnóstico solicitado no existe.', 404);
      }
      return rows[0];
    },

    async updateDiagnostico(accessToken, orgId, diagnosticoId, changes, expectedVersion) {
      const actual = await this.getDiagnosticoById(accessToken, orgId, diagnosticoId);
      if (actual.version !== expectedVersion) {
        throw new ServiceError('CONFLICTO_CONCURRENCIA', 'El diagnóstico fue modificado por otra sesión.', 409);
      }

      const params = new URLSearchParams({
        id_diagnostico: `eq.${diagnosticoId}`,
        id_organizacion: `eq.${orgId}`,
        archived_at: 'is.null',
        version: `eq.${expectedVersion}`,
      });

      const body = await request('diagnosticos', accessToken, params, {
        method: 'PATCH',
        headers: { prefer: 'return=representation' },
        body: JSON.stringify(changes),
      });

      const rows = Array.isArray(body) ? body : [];
      if (!rows[0]) {
        throw new ServiceError('CONFLICTO_CONCURRENCIA', 'El diagnóstico fue modificado por otra sesión o no existe.', 409);
      }
      return rows[0];
    },
  };
}

function unconfiguredRepository(): OrganizationsRepository {
  const unavailable = async (..._args: unknown[]): Promise<never> => {
    throw new ServiceError(
      'CONFIGURACION_SUPABASE',
      'El servicio de Organizaciones no tiene configuradas SUPABASE_URL y SUPABASE_ANON_KEY.',
      503,
    );
  };
  return {
    list: unavailable,
    getById: unavailable,
    create: unavailable,
    update: unavailable,
    listCountries: unavailable,
    getLegalRecord: unavailable,
    createLegalRecord: unavailable,
    updateLegalRecord: unavailable,
    listCommitments: unavailable,
    listCommitmentOrigins: unavailable,
    createCommitment: unavailable,
    getCommitmentById: unavailable,
    updateCommitment: unavailable,
    listDiagnosticos: unavailable,
    createDiagnostico: unavailable,
    getDiagnosticoById: unavailable,
    updateDiagnostico: unavailable,
  };
}

export function createSupabaseOrganizationsRepositoryFromEnv(): OrganizationsRepository {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return unconfiguredRepository();
  return createSupabaseOrganizationsRepository({ supabaseUrl, anonKey });
}
