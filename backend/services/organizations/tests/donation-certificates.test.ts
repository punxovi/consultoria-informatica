import assert from 'node:assert/strict';
import { test } from 'node:test';
import { identifyDonationParties } from '../src/domain/donation-parties.ts';
import { createOrganizationsApplication } from '../src/application/organizations-service.ts';
import { createSupabaseOrganizationsRepository } from '../src/infrastructure/supabase-organizations.repository.ts';

const org = '11111111-1111-4111-8111-111111111111';
const country = '22222222-2222-4222-8222-222222222222';
const donation = '33333333-3333-4333-8333-333333333333';
const otherDonation = '44444444-4444-4444-8444-444444444444';
const fileId = '55555555-5555-4555-8555-555555555555';
const input = { tipo_respaldo: 'certificado', nombre_original: 'certificado.pdf', mime_type: 'application/pdf', tamano_bytes: 20 } as const;
const row = {
  id_archivo: fileId, id_donacion: donation, bucket_id: 'fge-archivos',
  ruta_objeto: `donaciones/${donation}/${fileId}.pdf`, ...input,
  categoria: 'certificado', estado_carga: 'reservado', version: 1,
};

test('donaciones: identifica ambas partes desde la perspectiva de la organización', () => {
  const data = { id_organizacion: org, id_pais: country, contraparte_nombre: 'Empresa solidaria' };
  const received = identifyDonationParties({ ...data, tipo_movimiento: 'recibida' });
  const delivered = identifyDonationParties({ ...data, tipo_movimiento: 'entregada' });
  assert.deepEqual(received.emisor, { tipo: 'contraparte', nombre: 'Empresa solidaria' });
  assert.deepEqual(received.receptor, { tipo: 'organizacion', id_organizacion: org, id_pais: country });
  assert.deepEqual(delivered.emisor, received.receptor);
  assert.deepEqual(delivered.receptor, received.emisor);
  assert.throws(() => identifyDonationParties({ ...data, tipo_movimiento: 'otro' }), { code: 'RESPUESTA_INVALIDA' });
});

test('certificados: reserva varios documentos sin duplicar mecanismo y conserva JWT/metadatos', async () => {
  const created: Record<string, unknown>[] = [];
  const repo = createSupabaseOrganizationsRepository({
    supabaseUrl: 'https://database.invalid', anonKey: 'anon-key',
    fetchImpl: async (url, init) => {
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer usuario');
      if (new URL(String(url)).pathname.endsWith('/donaciones')) return Response.json([{ id_donacion: donation, id_organizacion: org }]);
      const payload = JSON.parse(String(init?.body));
      created.push(payload);
      return Response.json([{ ...payload, version: 1 }]);
    },
  });
  const app = createOrganizationsApplication(repo);
  const a = await app.reserveDonationFile('usuario', donation, input);
  const b = await app.reserveDonationFile('usuario', donation, { ...input, nombre_original: 'certificado-2.pdf' });
  assert.notEqual(a.id_archivo, b.id_archivo);
  assert.equal(a.id_donacion, b.id_donacion);
  assert.equal(a.tipo_respaldo, 'certificado');
  assert.equal(a.bucket_id, 'fge-archivos');
  assert.equal(a.estado_carga, 'reservado');
  assert.equal(created.length, 2);
  assert.equal(a.ruta_objeto, `donaciones/${donation}/${a.id_archivo}.pdf`);
});

test('certificados: rechaza una donación ajena al reservar antes de tocar Supabase', async () => {
  const repo = createSupabaseOrganizationsRepository({
    supabaseUrl: 'https://database.invalid', anonKey: 'key', fetchImpl: async () => { assert.fail('No debe consultar'); },
  });
  assert.throws(() => createOrganizationsApplication(repo).reserveDonationFile('token', donation, { ...input, id_donacion: otherDonation }), { code: 'DONACION_NO_COINCIDE' });
  await assert.rejects(repo.reserveDonationFile('token', donation, { ...input, id_donacion: otherDonation }), { code: 'DONACION_NO_COINCIDE' });
});

test('certificados: rechaza referencias cruzadas y rutas/buckets manipulados antes de Storage', async () => {
  for (const data of [
    { ...row, id_donacion: otherDonation, ruta_objeto: `donaciones/${otherDonation}/${fileId}.pdf` },
    { ...row, bucket_id: 'public' }, { ...row, ruta_objeto: `donaciones/${otherDonation}/${fileId}.pdf` },
    { ...row, ruta_objeto: `donaciones/${donation}/%2e%2e%2fsecreto.pdf` },
    { ...row, categoria: 'fotografia' },
  ]) {
    const repo = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://database.invalid', anonKey: 'key',
      fetchImpl: async url => {
        assert.match(String(url), /rest\/v1\/archivos/);
        return Response.json([data]);
      },
    });
    await assert.rejects(repo.downloadDonationFile('token', donation, fileId), { code: 'RESPUESTA_INVALIDA' });
  }
});

test('certificados: errores de integridad SQL conservan códigos descriptivos', async () => {
  for (const code of ['RESPALDO_INMUTABLE', 'ESTADO_RESPALDO_INVALIDO', 'RESPALDO_INVALIDO']) {
    const repo = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://database.invalid', anonKey: 'key',
      fetchImpl: async url => new URL(String(url)).pathname.endsWith('/donaciones')
        ? Response.json([{ id_donacion: donation }])
        : Response.json({ code: '23514', message: `${code}: Documento inválido.` }, { status: 400 }),
    });
    await assert.rejects(repo.reserveDonationFile('token', donation, input), { code, status: code === 'RESPALDO_INVALIDO' ? 400 : 409 });
  }
});
