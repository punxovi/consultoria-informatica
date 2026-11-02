import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  assertFileSignature, assertPublicationChange, createEvidenceSchema, updateEvidenceSchema,
} from '../src/domain/evidences.ts';
import { createSupabaseEvidencesRepository } from '../src/infrastructure/supabase-evidences.repository.ts';

const actionId = '44444444-4444-4444-8444-444444444444';
const evidenceId = '66666666-6666-4666-8666-666666666666';
const bytes = Buffer.from('%PDF-123');
const item = { id_evidencia: evidenceId, id_accion: actionId, ruta_objeto: `${actionId}/${evidenceId}`,
  bucket_id: 'fge-evidencias', mime_type: 'application/pdf', tamano_bytes: bytes.length,
  nombre_original: 'acta.pdf', estado_carga: 'reservado', estado_publicacion: 'no_publicada', version: 1 };
const valid = { id_accion: actionId, origen: 'Terreno', descripcion: 'Registro',
  nombre_original: 'acta.pdf', mime_type: 'application/pdf', tamano_bytes: bytes.length };

describe('schemas Zod de Evidencias', () => {
  test('acepta metadatos y consentimiento completo', () => {
    assert.equal(createEvidenceSchema.safeParse({ ...valid, consentimiento: {
      consentimiento_declarado: true, declaracion_consentimiento: 'Autorizó la publicación',
    } }).success, true);
    assert.equal(updateEvidenceSchema.safeParse({ version_esperada: 1, cambios: {
      estado_publicacion: 'publicada', consentimiento: {
        consentimiento_declarado: true, declaracion_consentimiento: 'Autorizó la publicación',
      },
    } }).success, true);
  });
  test('rechaza tipos, tamaño, acción y consentimiento inválidos', () => {
    for (const input of [
      { ...valid, id_accion: 'otro' }, { ...valid, mime_type: 'text/plain' },
      { ...valid, tamano_bytes: 0 }, { ...valid, tamano_bytes: 52_428_801 },
      { ...valid, descripcion: ' ' },
      { ...valid, nombre_original: 'archivo.exe' },
      { ...valid, consentimiento: { consentimiento_declarado: true } },
    ]) assert.equal(createEvidenceSchema.safeParse(input).success, false);
    assert.equal(updateEvidenceSchema.safeParse({ version_esperada: 0, cambios: { descripcion: 'x' } }).success, false);
    assert.equal(updateEvidenceSchema.safeParse({ version_esperada: 1, cambios: { estado_publicacion: 'borrador' } }).success, false);
  });
  test('comprueba firma real del archivo', () => {
    assert.doesNotThrow(() => assertFileSignature(bytes, 'application/pdf'));
    assert.throws(() => assertFileSignature(Buffer.from('no-pdf!!'), 'application/pdf'), { code: 'ARCHIVO_INVALIDO' });
  });
  test('requiere carga y consentimiento antes de publicar; impide transiciones inválidas', () => {
    assert.throws(() => assertPublicationChange(item as never, { estado_publicacion: 'publicada' }), { code: 'PUBLICACION_INVALIDA' });
    assert.throws(() => assertPublicationChange({ ...item, estado_carga: 'disponible' } as never,
      { estado_publicacion: 'publicada' }), { code: 'CONSENTIMIENTO_REQUERIDO' });
    assert.doesNotThrow(() => assertPublicationChange({ ...item, estado_carga: 'disponible' } as never,
      { estado_publicacion: 'publicada', consentimiento: { consentimiento_declarado: true, declaracion_consentimiento: 'Sí' } }));
    assert.throws(() => assertPublicationChange(item as never, { estado_publicacion: 'retirada' }), { code: 'PUBLICACION_INVALIDA' });
  });
});

describe('repositorio de Evidencias y Storage', () => {
  test('valida relación, registra, filtra, actualiza, sube y descarga con JWT', async () => {
    const calls: Array<{ url: string; method: string; authorization: string | null; body: string }> = [];
    let current = { ...item };
    const repo = createSupabaseEvidencesRepository({ supabaseUrl: 'https://supa.test', anonKey: 'anon', fetchImpl: (async (input, init) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const headers = new Headers(init?.headers);
      calls.push({ url, method, authorization: headers.get('authorization'), body: String(init?.body ?? '') });
      if (url.includes('/rest/v1/acciones?')) return Response.json([{ id_accion: actionId }]);
      if (url.includes('/storage/v1/object/')) {
        if (method === 'GET') return new Response(bytes, { status: 200 });
        return Response.json({ Key: item.ruta_objeto });
      }
      if (method === 'POST') return Response.json([current]);
      if (method === 'PATCH') {
        current = { ...current, ...JSON.parse(String(init?.body)), version: current.version + 1 };
        return Response.json([current]);
      }
      return Response.json([current]);
    }) as typeof fetch });
    assert.equal((await repo.list('jwt', { actionId }))[0].id_evidencia, evidenceId);
    assert.equal((await repo.create('jwt', valid as never)).id_evidencia, evidenceId);
    assert.equal((await repo.update('jwt', evidenceId, { version_esperada: 1,
      cambios: { consentimiento: { consentimiento_declarado: true, declaracion_consentimiento: 'Sí' } },
    })).version, 2);
    assert.equal((await repo.upload('jwt', evidenceId, 2, bytes, 'application/pdf')).estado_carga, 'disponible');
    assert.deepEqual((await repo.download('jwt', evidenceId)).bytes, bytes);
    assert.equal(calls.some((call) => call.url.includes('/storage/v1/object/fge-evidencias/') && call.method === 'POST'), true);
    assert.equal(calls.every((call) => call.authorization === 'Bearer jwt'), true);
    assert.equal(calls.find((call) => call.method === 'POST' && call.url.includes('/rest/v1/evidencias'))?.body.includes('estado_publicacion'), false);
  });
  test('no carga bytes con tipo o tamaño distinto, y traduce permisos', async () => {
    let storageCalls = 0;
    const repo = createSupabaseEvidencesRepository({ supabaseUrl: 'https://supa.test', anonKey: 'anon', fetchImpl: (async (input) => {
      const url = String(input);
      if (url.includes('/storage/')) { storageCalls++; return Response.json({}); }
      return Response.json([item]);
    }) as typeof fetch });
    await assert.rejects(repo.upload('jwt', evidenceId, 1, bytes, 'image/png'), { code: 'ARCHIVO_INVALIDO' });
    await assert.rejects(repo.upload('jwt', evidenceId, 1, Buffer.from('x'), 'application/pdf'), { code: 'ARCHIVO_INVALIDO' });
    await assert.rejects(repo.upload('jwt', evidenceId, 1, Buffer.from('no-pdf!!'), 'application/pdf'), { code: 'ARCHIVO_INVALIDO' });
    assert.equal(storageCalls, 0);
    const denied = createSupabaseEvidencesRepository({ supabaseUrl: 'https://supa.test', anonKey: 'anon', fetchImpl: (async () =>
      Response.json({ code: '42501', message: 'denied' }, { status: 403 })) as typeof fetch });
    await assert.rejects(denied.getById('jwt', evidenceId), { code: 'SIN_PERMISO' });
  });
});
