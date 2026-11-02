import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import { createSupabaseOrganizationsRepository } from '../src/infrastructure/supabase-organizations.repository.ts';

const organization = {
  id_organizacion: '22222222-2222-4222-8222-222222222222',
  nombre: 'Organización QA',
};

describe('repositorio Supabase de Organizaciones', () => {
  test('lista, consulta, crea y actualiza mediante PostgREST con Bearer', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const repository = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co',
      anonKey: 'anon-key',
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes('/paises?')) {
          return Response.json([{ id_pais: '11111111-1111-4111-8111-111111111111', codigo_iso: 'CL', nombre: 'Chile' }]);
        }
        return Response.json([organization]);
      },
    });

    await repository.list('token', { includeArchived: false });
    await repository.getById('token', organization.id_organizacion);
    await repository.create('token', { nombre: 'Organización QA' } as never);
    await repository.update('token', organization.id_organizacion, { nombre: 'Editada' }, 3);
    await repository.listCountries('token');

    assert.equal(calls.length, 5);
    assert.match(calls[0].url, /archived_at=is\.null/);
    assert.equal(new Headers(calls[0].init?.headers).get('authorization'), 'Bearer token');
    assert.equal(calls[2].init?.method, 'POST');
    assert.equal(new Headers(calls[2].init?.headers).get('prefer'), 'return=representation');
    assert.match(calls[3].url, /version=eq\.3/);
  });

  test('distingue registros inexistentes, concurrencia, permisos y relaciones', async () => {
    const empty = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'key',
      fetchImpl: async () => Response.json([]),
    });
    await assert.rejects(empty.getById('token', organization.id_organizacion),
      (error) => error instanceof ServiceError && error.code === 'NO_ENCONTRADA');
    await assert.rejects(empty.update('token', organization.id_organizacion, { nombre: 'X' }, 2),
      (error) => error instanceof ServiceError && error.code === 'CONFLICTO_CONCURRENCIA');

    const relation = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'key',
      fetchImpl: async () => Response.json({ code: '23503' }, { status: 409 }),
    });
    await assert.rejects(relation.create('token', {} as never),
      (error) => error instanceof ServiceError && error.code === 'PAIS_NO_EXISTE');

    const denied = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'key',
      fetchImpl: async () => Response.json({ code: '42501' }, { status: 403 }),
    });
    await assert.rejects(denied.list('token', { includeArchived: false }),
      (error) => error instanceof ServiceError && error.code === 'SIN_PERMISO');
  });

  test('consulta y guarda expediente legal, PDF privado y control de versión', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const rawLegal = {
      id_informacion_legal: '33333333-3333-4333-8333-333333333333',
      id_organizacion: organization.id_organizacion,
      estado_personalidad_juridica: 'si', tipo_personalidad_juridica: 'PJ',
      numero_registro: 'REG-1', fecha_constitucion: '2020-01-01', vigencia_directiva: 'Vigente',
      version: 2, updated_at: '2026-10-07T00:00:00Z',
      documentos: [
        { tipo: 'identidad_representante', estado: 'cargado', archivo: { nombre_original: 'identidad.pdf' } },
        { tipo: 'identificacion_legal', estado: 'no_aplica', archivo: null },
        { tipo: 'estatutos', estado: 'pendiente', archivo: null },
      ],
    };
    const repository = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'key',
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes('/storage/v1/object/')) return Response.json({ Key: 'ok' });
        if (url.includes('/rest/v1/rpc/guardar_expediente_legal')) return Response.json(rawLegal.id_informacion_legal);
        if (url.includes('/rest/v1/informacion_legal?')) return Response.json([rawLegal]);
        if (url.includes('/rest/v1/organizaciones?')) return Response.json([organization]);
        return Response.json({ code: 'unexpected' }, { status: 500 });
      },
    });
    const input = {
      fields: {
        estado_personalidad_juridica: 'si' as const, tipo_personalidad_juridica: 'PJ' as const,
        numero_registro: 'REG-1', fecha_constitucion: '2020-01-01', vigencia_directiva: 'Vigente',
      },
      documents: [
        { tipo: 'identidad_representante' as const, estado: 'cargado' as const },
        { tipo: 'identificacion_legal' as const, estado: 'no_aplica' as const },
        { tipo: 'estatutos' as const, estado: 'pendiente' as const },
      ],
      files: {
        identidad_representante: {
          tipo: 'identidad_representante' as const, nombre: 'identidad.pdf',
          mimeType: 'application/pdf' as const, bytes: new TextEncoder().encode('%PDF-1.4 QA'),
        },
      },
    };

    const saved = await repository.createLegalRecord('token', organization.id_organizacion, input);
    assert.equal(saved.documentos[0].nombre_archivo, 'identidad.pdf');
    assert.ok(calls.some(({ url }) => /storage\/v1\/object\/fge-expedientes-legales\/expedientes\/.+\.pdf$/.test(url)));
    const rpc = calls.find(({ url }) => url.includes('rpc/guardar_expediente_legal'))!;
    const rpcBody = JSON.parse(String(rpc.init?.body));
    assert.equal(rpcBody.p_version_esperada, null);
    assert.equal(rpcBody.p_datos.documentos[0].archivo.mime_type, 'application/pdf');

    calls.length = 0;
    await repository.updateLegalRecord('token', organization.id_organizacion, {
      ...input, files: {}, expectedVersion: 2,
    });
    const updateRpc = calls.find(({ url }) => url.includes('rpc/guardar_expediente_legal'))!;
    assert.equal(JSON.parse(String(updateRpc.init?.body)).p_version_esperada, 2);
  });

  test('traduce errores de permisos y base de datos del expediente legal', async () => {
    const denied = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'key',
      fetchImpl: async () => Response.json({ code: '42501' }, { status: 403 }),
    });
    await assert.rejects(
      denied.getLegalRecord('token', organization.id_organizacion),
      (error) => error instanceof ServiceError && error.code === 'SIN_PERMISO' && error.status === 403,
    );

    const databaseFailure = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'key',
      fetchImpl: async () => Response.json({ code: 'XX000' }, { status: 500 }),
    });
    await assert.rejects(
      databaseFailure.getLegalRecord('token', organization.id_organizacion),
      (error) => error instanceof ServiceError && error.code === 'ERROR_BASE_DATOS' && error.status === 502,
    );
  });
});
