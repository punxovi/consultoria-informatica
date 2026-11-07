import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { test } from 'node:test';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import { createGatewayServer } from '../../../gateway/src/server.ts';
import { createCommitmentsPdfService } from '../src/application/commitments-pdf-service.ts';
import { createOrganizationsApplication } from '../src/application/organizations-service.ts';
import { parseCommitmentsPdfQuery, type PdfCommitment } from '../src/domain/commitments-pdf.ts';
import type { OrganizationsRepository } from '../src/domain/organizations.ts';
import { routeOrganizations } from '../src/http/routes.ts';
import { generateCommitmentsPdf } from '../src/infrastructure/commitments-pdf.ts';
import { createSupabaseOrganizationsRepository } from '../src/infrastructure/supabase-organizations.repository.ts';

const orgId = '11111111-1111-4111-8111-111111111111';
const otherOrgId = '22222222-2222-4222-8222-222222222222';
const actaId = '33333333-3333-4333-8333-333333333333';
const commitmentId = '44444444-4444-4444-8444-444444444444';
const organization = { id_organizacion: orgId, nombre: 'Fundación Niñez y Esperanza' };
const item: PdfCommitment = {
  id_compromiso: commitmentId, id_organizacion: orgId, id_acta: actaId,
  descripcion: 'Coordinar la entrega de útiles para niñas y niños.',
  responsable_nombre: 'María Muñoz', responsable_contacto: 'maria@example.invalid',
  fecha_limite: '2026-12-10', estado: 'pendiente', observaciones: 'Reunión con la organización.',
  cumplido_at: null, archived_at: null,
};
const context = { id_organizacion: orgId };
const fakePdf = Buffer.from('%PDF-1.7\n%%EOF\n');

test('PDF: pagina un objetivo de acta válido con muchos saltos de línea', async () => {
  const bytes = await generateCommitmentsPdf({ organization, context:{...context,id_acta:actaId},
    actas:{[actaId]:'Acta: '+'Punto acordado\n'.repeat(50)},commitments:[item],generatedAt:'2026-11-06T12:00:00Z' });
  assert.match(bytes.subarray(0,5).toString(),/%PDF-/);
  assert.ok((bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length >= 3,
    'El contexto y el detalle deben continuar en páginas adicionales, sin pintar el contexto fuera de la primera hoja.');
});

function repository(rows: unknown = [item]): OrganizationsRepository {
  return createSupabaseOrganizationsRepository({
    supabaseUrl: 'https://database.invalid', anonKey: 'anon-key',
    fetchImpl: async input => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/organizaciones')) return Response.json([organization]);
      if (url.pathname.endsWith('/rpc/consultar_compromisos')) return Response.json(rows);
      throw new Error(`Consulta inesperada en la prueba: ${url.pathname}`);
    },
  });
}

test('PDF: valida organización, UUID de acta y rechaza filtros desconocidos o duplicados', () => {
  assert.deepEqual(parseCommitmentsPdfQuery(orgId, new URLSearchParams()), context);
  assert.deepEqual(parseCommitmentsPdfQuery(orgId, new URLSearchParams({ id_acta: actaId })), { ...context, id_acta: actaId });
  for (const query of ['id_acta=', 'id_acta=invalido', `id_acta=${actaId}&id_acta=${actaId}`, 'estado=pendiente', `id_organizacion=${otherOrgId}`]) {
    assert.throws(() => parseCommitmentsPdfQuery(orgId, new URLSearchParams(query)), { code: 'DATOS_INVALIDOS' });
  }
  assert.throws(() => parseCommitmentsPdfQuery('invalido', new URLSearchParams()), { code: 'DATOS_INVALIDOS' });
});

test('PDF: obtiene organización y compromisos con el mismo JWT, filtra por acta y ordena', async () => {
  const calls: Array<{ url: URL; init?: RequestInit }> = [];
  const repo = createSupabaseOrganizationsRepository({
    supabaseUrl: 'https://database.invalid', anonKey: 'anon-key',
    fetchImpl: async (input, init) => {
      const url = new URL(String(input));
      calls.push({ url, init });
      return Response.json(url.pathname.endsWith('/organizaciones') ? [organization] : [
        { ...item, fecha_limite: '2027-01-01' }, { ...item, id_compromiso: otherOrgId },
      ]);
    },
  });
  const service = createCommitmentsPdfService(repo, async document => {
    assert.equal(document.organization.nombre, organization.nombre);
    assert.equal(document.commitments[0].fecha_limite, '2026-12-10');
    return fakePdf;
  });
  const file = await service('jwt-usuario', { ...context, id_acta: actaId });
  assert.equal(file.mimeType, 'application/pdf');
  assert.match(file.fileName, /-acta-/);
  assert.equal(calls[0].url.searchParams.get('id_organizacion'), `eq.${orgId}`);
  assert.equal(calls[1].url.pathname, '/rest/v1/rpc/consultar_compromisos');
  assert.deepEqual(JSON.parse(String(calls[1].init?.body)), { p_id_organizacion: orgId, p_id_acta: actaId });
  for (const call of calls) {
    assert.equal(new Headers(call.init?.headers).get('authorization'), 'Bearer jwt-usuario');
    assert.equal(new Headers(call.init?.headers).get('apikey'), 'anon-key');
  }
});

test('PDF: bloquea registros ajenos, archivados o corruptos antes de renderizar', async () => {
  for (const rows of [
    [{ ...item, id_organizacion: otherOrgId }], [{ ...item, id_acta: otherOrgId }],
    [{ ...item, fecha_limite: '2026-02-30' }], [{ ...item, estado: 'cumplido' }],
    [{ ...item, archived_at: '2026-11-01T00:00:00Z' }], [{ ...item, descripcion: null }], {},
  ]) {
    const service = createCommitmentsPdfService(repository(rows), async () => { assert.fail('No debe renderizar'); });
    await assert.rejects(service('token', { ...context, id_acta: actaId }), { code: 'RESPUESTA_INVALIDA' });
  }
  const repo = repository();
  repo.getById = async () => ({ ...organization, id_organizacion: otherOrgId }) as never;
  await assert.rejects(createCommitmentsPdfService(repo, async () => fakePdf)('token', context), { code: 'RESPUESTA_INVALIDA' });
});

test('PDF: distingue falta de datos, tamaño, errores del generador y sesión', async () => {
  await assert.rejects(createCommitmentsPdfService(repository([]), async () => fakePdf)('token', context), { code: 'COMPROMISOS_SIN_DATOS', status: 404 });
  await assert.rejects(createCommitmentsPdfService(repository(Array(501).fill(item)), async () => fakePdf)('token', context), { code: 'PDF_DEMASIADO_GRANDE', status: 413 });
  await assert.rejects(createCommitmentsPdfService(repository(), async () => { throw new Error('detalle privado'); })('token', context), { code: 'PDF_GENERACION_FALLIDA', status: 500 });
  await assert.rejects(createCommitmentsPdfService(repository(), async () => Buffer.from('archivo roto'))('token', context), { code: 'PDF_GENERACION_FALLIDA' });
  await assert.rejects(createCommitmentsPdfService(repository(), async () => fakePdf)('', context), { code: 'SESION_REQUERIDA' });
});

test('PDF: propaga permisos y disponibilidad de Supabase sin generar documento', async () => {
  for (const [status, code, expected] of [[403, '42501', 'SIN_PERMISO'], [401, '', 'SIN_PERMISO'], [400, 'P0002', 'NO_ENCONTRADO']] as const) {
    const repo = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://database.invalid', anonKey: 'key',
      fetchImpl: async input => String(input).includes('/organizaciones?') ? Response.json([organization]) : Response.json({ code }, { status }),
    });
    await assert.rejects(createCommitmentsPdfService(repo, async () => { assert.fail('No debe renderizar'); })('token', context), { code: expected });
  }
  const repo = createSupabaseOrganizationsRepository({
    supabaseUrl: 'https://database.invalid', anonKey: 'key', fetchImpl: async () => { throw new Error('offline'); },
  });
  await assert.rejects(createCommitmentsPdfService(repo, async () => fakePdf)('token', context), { code: 'SUPABASE_NO_DISPONIBLE', status: 503 });
});

test('PDF: renderiza un documento real con textos largos y múltiples páginas', async () => {
  const bytes = await generateCommitmentsPdf({ organization, context, commitments: Array.from({ length: 12 }, (_, index) => ({
    ...item, descripcion: `${index + 1}. ${'Descripción con acentos: niñez, educación y colaboración. '.repeat(30)}`,
    observaciones: 'Información adicional de seguimiento. '.repeat(40),
  })) });
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.match(bytes.subarray(-64).toString(), /%%EOF/);
  assert.ok((bytes.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length > 2);
});

async function listen(server: Server): Promise<string> {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se inició el servidor');
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('PDF: descarga binaria por Gateway, cabeceras, CORS y errores JSON sin adjunto', async () => {
  const repo = repository();
  const app = createOrganizationsApplication(repo);
  const server = createServer((req, res) => { void routeOrganizations(req, res, 'pdf-request-id', app); });
  const base = await listen(server);
  const gateway = createGatewayServer({ targets: { organizations: new URL(base) } });
  try {
    const url = `${await listen(gateway)}/api/v1/organizations/${orgId}/commitments/pdf`;
    const headers = { authorization: 'Bearer token', origin: 'http://127.0.0.1:4321' };
    const response = await fetch(url, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(response.headers.get('content-disposition') ?? '', /^attachment; filename="compromisos-/);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(response.headers.get('x-request-id'));
    assert.match(response.headers.get('access-control-expose-headers') ?? '', /content-disposition/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert.equal(Number(response.headers.get('content-length')), bytes.length);

    for (const [suffix, options, status, code] of [
      ['', {}, 401, 'SESION_REQUERIDA'],
      ['?id_acta=mal', { headers }, 400, 'DATOS_INVALIDOS'],
      ['?estado=pendiente', { headers }, 400, 'DATOS_INVALIDOS'],
      ['', { headers, method: 'POST' }, 405, 'METODO_NO_PERMITIDO'],
    ] as const) {
      const errorResponse = await fetch(`${url}${suffix}`, options);
      assert.equal(errorResponse.status, status);
      assert.equal(errorResponse.headers.get('content-disposition'), null);
      const body = await errorResponse.json();
      assert.equal(body.ok, false);
      assert.equal(body.data, null);
      assert.equal(body.error.code, code);
      if (status === 405) assert.equal(errorResponse.headers.get('allow'), 'GET');
    }
    repo.listCommitments = async () => [];
    const empty = await fetch(url, { headers });
    assert.equal(empty.status, 404);
    assert.equal((await empty.json()).error.code, 'COMPROMISOS_SIN_DATOS');
    repo.listCommitments = async () => { throw new ServiceError('SIN_PERMISO', 'Acceso denegado.', 403); };
    const denied = await fetch(url, { headers });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error.code, 'SIN_PERMISO');
    app.downloadCommitmentsPdf = async () => { throw new ServiceError('PDF_GENERACION_FALLIDA', 'No fue posible generar el PDF.', 500); };
    const failed = await fetch(url, { headers });
    assert.equal(failed.status, 500);
    assert.equal((await failed.json()).error.code, 'PDF_GENERACION_FALLIDA');
    assert.equal(failed.headers.get('content-disposition'), null);
  } finally {
    await close(gateway);
    await close(server);
  }
});
