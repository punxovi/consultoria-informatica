import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { createGatewayServer } from '../src/server.ts';

let authServer: Server;
let organizationsServer: Server;
let programsServer: Server;
let interventionsServer: Server;
let insightsServer: Server;
let gatewayServer: Server;
let gatewayUrl: string;

async function listen(server: Server): Promise<URL> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No fue posible iniciar el servidor de prueba.');
  return new URL(`http://127.0.0.1:${address.port}`);
}

before(async () => {
  authServer = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({
      path: request.url,
      authorization: request.headers.authorization,
      requestId: request.headers['x-request-id'],
      body: Buffer.concat(chunks).toString('utf8'),
    }));
  });
  const authUrl = await listen(authServer);
  organizationsServer = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ path: request.url, method: request.method, authorization: request.headers.authorization, territoryId: request.headers['x-territory-id'] }));
  });
  const organizationsUrl = await listen(organizationsServer);
  programsServer = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ path: request.url, method: request.method, authorization: request.headers.authorization }));
  });
  const programsUrl = await listen(programsServer);
  interventionsServer = createServer(async (request, response) => {
    if (request.url?.includes('/file?') && request.method === 'PUT') {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ path: request.url, method: request.method,
        authorization: request.headers.authorization, contentType: request.headers['content-type'],
        bytes: Buffer.concat(chunks).toString('ascii') }));
      return;
    }
    if (request.url?.endsWith('/file') && request.method === 'GET') {
      response.setHeader('content-type', 'application/pdf');
      response.setHeader('content-disposition', "attachment; filename*=UTF-8''registro.pdf");
      response.setHeader('cache-control', 'private, no-store');
      response.end('%PDF-123');
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ path: request.url, method: request.method, authorization: request.headers.authorization }));
  });
  const interventionsUrl = await listen(interventionsServer);
  insightsServer = createServer((request, response) => {
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ path: request.url, authorization: request.headers.authorization }));
  });
  const insightsUrl = await listen(insightsServer);
  gatewayServer = createGatewayServer({ targets: {
    auth: authUrl, organizations: organizationsUrl, programs: programsUrl,
    interventions: interventionsUrl, insights: insightsUrl,
  } });
  gatewayUrl = (await listen(gatewayServer)).origin;
});

after(async () => {
  await Promise.all([
    new Promise<void>((resolve) => authServer.close(() => resolve())),
    new Promise<void>((resolve) => organizationsServer.close(() => resolve())),
    new Promise<void>((resolve) => programsServer.close(() => resolve())),
    new Promise<void>((resolve) => interventionsServer.close(() => resolve())),
    new Promise<void>((resolve) => insightsServer.close(() => resolve())),
    new Promise<void>((resolve) => gatewayServer.close(() => resolve())),
  ]);
});

describe('API Gateway', () => {
  test('publica un health check estable', async () => {
    const response = await fetch(`${gatewayUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.data.service, 'api-gateway');
    assert.equal(body.data.status, 'ok');
  });

  test('enruta Auth sin perder sesión, cuerpo ni request ID', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/auth/login?source=test`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token-de-prueba',
        'content-type': 'application/json',
        'x-request-id': 'qa-123',
      },
      body: JSON.stringify({ correo: 'qa@example.com' }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.path, '/v1/auth/login?source=test');
    assert.equal(body.authorization, 'Bearer token-de-prueba');
    assert.equal(body.requestId, 'qa-123');
    assert.equal(body.body, '{"correo":"qa@example.com"}');
  });

  test('rechaza rutas que todavía no pertenecen a un servicio', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/desconocido`);
    const body = await response.json();

    assert.equal(response.status, 404);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'RUTA_NO_ENCONTRADA');
  });

  test('enruta Organizaciones con filtros y sesión', async () => {
    const query = 'search=comedor&id_pais=11111111-1111-4111-8111-111111111111&id_programa=22222222-2222-4222-8222-222222222222';
    const response = await fetch(`${gatewayUrl}/api/v1/organizations?${query}`, {
      headers: { authorization: 'Bearer sesion-organizaciones' },
    });
    const body = await response.json();
    assert.equal(body.path, `/v1/organizations?${query}`);
    assert.equal(body.authorization, 'Bearer sesion-organizaciones');
  });

  test('enruta Expediente Legal al servicio de Organizaciones conservando método y sesión', async () => {
    const orgId = '22222222-2222-4222-8222-222222222222';
    for (const method of ['GET', 'POST', 'PATCH']) {
      const response = await fetch(`${gatewayUrl}/api/v1/organizations/${orgId}/legal-record`, {
        method,
        headers: { authorization: 'Bearer sesion-expediente' },
      });
      const body = await response.json();
      assert.equal(body.path, `/v1/organizations/${orgId}/legal-record`);
      assert.equal(body.method, method);
      assert.equal(body.authorization, 'Bearer sesion-expediente');
    }
  });

  test('enruta Donaciones al servicio de Organizaciones conservando método y sesión', async () => {
    const donationId = '77777777-7777-4777-8777-777777777777';
    const response = await fetch(`${gatewayUrl}/api/v1/donations/${donationId}/files`, {
      method: 'GET',
      headers: { authorization: 'Bearer sesion-donaciones' },
    });
    const body = await response.json();
    assert.equal(body.path, `/v1/donations/${donationId}/files`);
    assert.equal(body.method, 'GET');
    assert.equal(body.authorization, 'Bearer sesion-donaciones');
    for (const method of ['PATCH', 'DELETE']) {
      for (const path of [`/api/v1/donations/${donationId}`, `/api/v1/organizations/22222222-2222-4222-8222-222222222222/donations/${donationId}`]) {
        const result = await fetch(`${gatewayUrl}${path}`, { method,
          headers: { authorization: 'Bearer sesion-donaciones', 'content-type': 'application/json' },
          body: JSON.stringify({ version_esperada: 1 }),
        });
        const forwarded = await result.json();
        assert.equal(forwarded.path, path.replace('/api', ''));
        assert.equal(forwarded.method, method);
        assert.equal(forwarded.authorization, 'Bearer sesion-donaciones');
      }
    }
  });

  test('enruta Programas conservando método y sesión', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/programs/22222222-2222-4222-8222-222222222222`, {
      method: 'PATCH',
      headers: { authorization: 'Bearer sesion-programas', 'content-type': 'application/json' },
      body: JSON.stringify({ cambios: { nombre: 'Programa' } }),
    });
    const body = await response.json();
    assert.equal(body.path, '/v1/programs/22222222-2222-4222-8222-222222222222');
    assert.equal(body.method, 'PATCH');
    assert.equal(body.authorization, 'Bearer sesion-programas');
  });

  test('enruta Planes, Acciones, Actas y Evidencias al contexto de Intervenciones', async () => {
    for (const path of [
      '/api/v1/plans?incluir_archivados=false',
      '/api/v1/actions?estado=atrasada',
      '/api/v1/meeting-minutes?id_organizacion=11111111-1111-4111-8111-111111111111',
      '/api/v1/evidences?id_accion=44444444-4444-4444-8444-444444444444',
    ]) {
      const response = await fetch(`${gatewayUrl}${path}`, { headers: { authorization: 'Bearer sesion-intervenciones' } });
      const body = await response.json();
      assert.equal(body.path, path.replace('/api', ''));
      assert.equal(body.authorization, 'Bearer sesion-intervenciones');
    }
  });

  test('enruta Dashboard y Reportes al contexto de Insights', async () => {
    for (const path of ['/api/v1/dashboard?id_pais=11111111-1111-4111-8111-111111111111&anio=2026', '/api/v1/reports/overview']) {
      const response = await fetch(`${gatewayUrl}${path}`, { headers: { authorization: 'Bearer sesion-insights' } });
      const body = await response.json();
      assert.equal(body.path, path.replace('/api', ''));
      assert.equal(body.authorization, 'Bearer sesion-insights');
    }
  });

  test('reenvía el contexto territorial sin convertirlo en una credencial', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/organizations/temporary-coverages/mine`, {
      headers: {
        authorization: 'Bearer sesion-coordinador',
        'x-territory-id': '11111111-1111-4111-8111-111111111111',
      },
    });
    const body = await response.json();
    assert.equal(body.path, '/v1/organizations/temporary-coverages/mine');
    assert.equal(body.authorization, 'Bearer sesion-coordinador');
    assert.equal(body.territoryId, '11111111-1111-4111-8111-111111111111');
  });

  test('conserva el archivo privado y sus cabeceras al descargar una evidencia', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/evidences/66666666-6666-4666-8666-666666666666/file`, {
      headers: { authorization: 'Bearer sesion-intervenciones' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.match(response.headers.get('content-disposition') ?? '', /registro\.pdf/);
    assert.equal(await response.text(), '%PDF-123');
  });

  test('envía el archivo binario y la sesión al servicio de Evidencias', async () => {
    const response = await fetch(`${gatewayUrl}/api/v1/evidences/66666666-6666-4666-8666-666666666666/file?version_esperada=1`, {
      method: 'PUT', headers: { authorization: 'Bearer sesion-intervenciones', 'content-type': 'application/pdf' }, body: '%PDF-123',
    });
    const body = await response.json();
    assert.equal(body.path, '/v1/evidences/66666666-6666-4666-8666-666666666666/file?version_esperada=1');
    assert.equal(body.authorization, 'Bearer sesion-intervenciones');
    assert.equal(body.contentType, 'application/pdf');
    assert.equal(body.bytes, '%PDF-123');
  });
});
