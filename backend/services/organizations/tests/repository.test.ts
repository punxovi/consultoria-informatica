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
});
