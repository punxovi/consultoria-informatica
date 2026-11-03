import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import type { OrganizationsApplication } from '../src/application/organizations-service.ts';
import {
  ORGANIZATION_IMAGE_MAX_BYTES,
  parseOrganizationImageMimeType,
  parseOrganizationImageUpload,
} from '../src/domain/organizations.ts';
import { createSupabaseOrganizationsRepository } from '../src/infrastructure/supabase-organizations.repository.ts';
import { createOrganizationsServer } from '../src/server.ts';

const orgId = '22222222-2222-4222-8222-222222222222';
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const imageRow = {
  id_archivo: '44444444-4444-4444-8444-444444444444',
  nombre_original: 'fachada.png',
  mime_type: 'image/png',
  tamano_bytes: png.length,
  updated_at: '2026-11-03T00:00:00Z',
};

function rejectsWith(code: string) {
  return (error: unknown) => error instanceof ServiceError && error.code === code;
}

describe('imagen representativa de Organizaciones: validación', () => {
  test('acepta solo JPG, PNG o WebP y normaliza el tipo declarado', () => {
    assert.equal(parseOrganizationImageMimeType('image/PNG; charset=binary'), 'image/png');
    assert.throws(() => parseOrganizationImageMimeType('application/pdf'), rejectsWith('IMAGEN_INVALIDA'));
    assert.throws(() => parseOrganizationImageMimeType('image/gif'), rejectsWith('IMAGEN_INVALIDA'));
    assert.throws(() => parseOrganizationImageMimeType(undefined), rejectsWith('IMAGEN_INVALIDA'));
  });

  test('exige contenido real, tamaño máximo y firma acorde al tipo', () => {
    assert.equal(parseOrganizationImageUpload(png, 'image/png', 'ruta/../fachada.png').nombre, 'ruta..fachada.png');
    assert.equal(parseOrganizationImageUpload(png, 'image/png', null).nombre, 'imagen.png');
    assert.throws(() => parseOrganizationImageUpload(Buffer.alloc(0), 'image/png', 'x.png'), rejectsWith('IMAGEN_INVALIDA'));
    assert.throws(() => parseOrganizationImageUpload(Buffer.from('no es imagen'), 'image/png', 'x.png'), rejectsWith('IMAGEN_INVALIDA'));
    assert.throws(() => parseOrganizationImageUpload(png, 'image/jpeg', 'x.jpg'), rejectsWith('IMAGEN_INVALIDA'));
    const enorme = Buffer.concat([png, Buffer.alloc(ORGANIZATION_IMAGE_MAX_BYTES)]);
    assert.throws(() => parseOrganizationImageUpload(enorme, 'image/png', 'x.png'), rejectsWith('IMAGEN_INVALIDA'));
  });
});

describe('imagen representativa de Organizaciones: repositorio Supabase', () => {
  test('incluye la imagen vigente al listar y consultar, con filtros sobre archivos', async () => {
    const urls: string[] = [];
    const repository = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'anon',
      fetchImpl: async (input) => {
        urls.push(String(input));
        return Response.json([
          { id_organizacion: orgId, nombre: 'Con imagen', imagen: [imageRow] },
          { id_organizacion: '55555555-5555-4555-8555-555555555555', nombre: 'Sin imagen', imagen: [] },
        ]);
      },
    });

    const [conImagen, sinImagen] = await repository.list('token', { includeArchived: false, idPrograma: '66666666-6666-4666-8666-666666666666' });
    assert.deepEqual(conImagen.imagen, imageRow);
    assert.equal(sinImagen.imagen, null);
    await repository.getById('token', orgId);

    for (const url of urls) {
      const params = new URL(url).searchParams;
      assert.match(params.get('select') ?? '', /imagen:archivos!archivos_id_organizacion_fkey\(id_archivo,/);
      assert.equal(params.get('imagen.categoria'), 'eq.imagen_organizacion');
      assert.equal(params.get('imagen.estado_carga'), 'eq.disponible');
      assert.equal(params.get('imagen.archived_at'), 'is.null');
    }
    assert.match(new URL(urls[0]).searchParams.get('select') ?? '', /planes!inner\(id_programa\)/);
  });

  test('sube al bucket existente fge-archivos y registra el reemplazo con la RPC', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const repository = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'anon',
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push({ url, init });
        if (url.includes('/rest/v1/organizaciones?')) return Response.json([{ id_organizacion: orgId, nombre: 'QA', imagen: [] }]);
        if (url.includes('/storage/v1/object/')) return Response.json({ Key: 'ok' });
        return Response.json(imageRow);
      },
    });

    const image = await repository.replaceOrganizationImage('token', orgId, { bytes: png, mimeType: 'image/png', nombre: 'fachada.png' });
    assert.deepEqual(image, imageRow);

    const upload = calls.find(({ url }) => url.includes('/storage/v1/object/'))!;
    assert.match(upload.url, new RegExp(`/storage/v1/object/fge-archivos/organizaciones/${orgId}/imagen/[0-9a-f-]{36}\\.png$`));
    assert.equal(upload.init?.method, 'POST');
    assert.equal(new Headers(upload.init?.headers).get('authorization'), 'Bearer token');
    assert.equal(new Headers(upload.init?.headers).get('x-upsert'), 'false');

    const rpc = calls.find(({ url }) => url.includes('/rpc/reemplazar_imagen_organizacion'))!;
    const payload = JSON.parse(String(rpc.init?.body));
    assert.equal(payload.p_id_organizacion, orgId);
    assert.equal(payload.p_ruta_objeto, upload.url.split('/fge-archivos/')[1]);
    assert.equal(payload.p_mime_type, 'image/png');
    assert.equal(payload.p_tamano_bytes, png.length);
  });

  test('retira el objeto huérfano si la base de datos rechaza el registro', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const repository = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'anon',
      fetchImpl: async (input, init) => {
        const url = String(input);
        calls.push({ url, method: init?.method ?? 'GET' });
        if (url.includes('/rest/v1/organizaciones?')) return Response.json([{ id_organizacion: orgId, nombre: 'QA' }]);
        if (url.includes('/storage/v1/object/')) return Response.json({});
        return Response.json({ code: '42501' }, { status: 403 });
      },
    });

    await assert.rejects(
      repository.replaceOrganizationImage('token', orgId, { bytes: png, mimeType: 'image/png', nombre: 'x.png' }),
      rejectsWith('SIN_PERMISO'),
    );
    const subida = calls.find(({ method, url }) => method === 'POST' && url.includes('/storage/'))!;
    assert.ok(calls.some(({ method, url }) => method === 'DELETE' && url === subida.url));
  });

  test('traduce el rechazo RLS de Storage como falta de permiso', async () => {
    const repository = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'anon',
      fetchImpl: async (input) => String(input).includes('/storage/')
        ? Response.json({ statusCode: '403', message: 'new row violates row-level security policy' }, { status: 400 })
        : Response.json([{ id_organizacion: orgId, nombre: 'QA' }]),
    });
    await assert.rejects(
      repository.replaceOrganizationImage('token', orgId, { bytes: png, mimeType: 'image/png', nombre: 'x.png' }),
      rejectsWith('SIN_PERMISO'),
    );
  });

  test('descarga la imagen vigente o informa que no existe', async () => {
    const urls: string[] = [];
    const repository = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'anon',
      fetchImpl: async (input) => {
        const url = String(input);
        urls.push(url);
        if (url.includes('/storage/')) return new Response(png, { headers: { 'content-type': 'image/png' } });
        return Response.json([{ ...imageRow, ruta_objeto: `organizaciones/${orgId}/imagen/a.png` }]);
      },
    });
    const file = await repository.downloadOrganizationImage('token', orgId);
    assert.deepEqual(file.bytes, png);
    assert.equal(file.mimeType, 'image/png');
    assert.match(urls[0], /categoria=eq\.imagen_organizacion/);
    assert.match(urls[0], /archived_at=is\.null/);
    assert.ok(urls[1].endsWith(`/storage/v1/object/fge-archivos/organizaciones/${orgId}/imagen/a.png`));

    const empty = createSupabaseOrganizationsRepository({
      supabaseUrl: 'https://proyecto.supabase.co', anonKey: 'anon',
      fetchImpl: async () => Response.json([]),
    });
    await assert.rejects(empty.downloadOrganizationImage('token', orgId), rejectsWith('IMAGEN_NO_ENCONTRADA'));
  });
});

describe('imagen representativa de Organizaciones: HTTP', () => {
  let server: Server;
  let baseUrl: string;
  let received: { orgId: string; mimeType: string; nombre: string; bytes: Buffer } | null = null;

  const application = {
    async replaceOrganizationImage(_token: string, id: string, upload: { mimeType: string; nombre: string; bytes: Buffer }) {
      received = { orgId: id, ...upload };
      return imageRow;
    },
    async downloadOrganizationImage() {
      return { bytes: png, mimeType: 'image/png', fileName: 'fachada.png' };
    },
  } as unknown as OrganizationsApplication;

  before(async () => {
    server = createOrganizationsServer(application);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No se inició el servidor.');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => new Promise<void>((resolve) => server.close(() => resolve())));

  test('guarda la imagen enviada como cuerpo binario', async () => {
    const response = await fetch(`${baseUrl}/v1/organizations/${orgId}/image?nombre=fachada.png`, {
      method: 'PUT', headers: { authorization: 'Bearer token', 'content-type': 'image/png' }, body: png,
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.code, 'IMAGEN_ORGANIZACION_GUARDADA');
    assert.equal(body.data.imagen.id_archivo, imageRow.id_archivo);
    assert.equal(received?.orgId, orgId);
    assert.equal(received?.nombre, 'fachada.png');
    assert.deepEqual(received?.bytes, png);
  });

  test('rechaza tipos no permitidos y contenido que no coincide antes de almacenar', async () => {
    received = null;
    const pdf = await fetch(`${baseUrl}/v1/organizations/${orgId}/image`, {
      method: 'PUT', headers: { authorization: 'Bearer token', 'content-type': 'application/pdf' }, body: '%PDF-1.4',
    });
    assert.equal(pdf.status, 400);
    assert.equal((await pdf.json()).error.code, 'IMAGEN_INVALIDA');

    const falsa = await fetch(`${baseUrl}/v1/organizations/${orgId}/image`, {
      method: 'PUT', headers: { authorization: 'Bearer token', 'content-type': 'image/jpeg' }, body: png,
    });
    assert.equal(falsa.status, 400);
    assert.equal((await falsa.json()).error.code, 'IMAGEN_INVALIDA');

    const grande = await fetch(`${baseUrl}/v1/organizations/${orgId}/image`, {
      method: 'PUT', headers: { authorization: 'Bearer token', 'content-type': 'image/png' },
      body: Buffer.concat([png, Buffer.alloc(ORGANIZATION_IMAGE_MAX_BYTES)]),
    });
    assert.equal(grande.status, 413);
    assert.equal(received, null);
  });

  test('exige sesión y un identificador válido', async () => {
    const sinSesion = await fetch(`${baseUrl}/v1/organizations/${orgId}/image`);
    assert.equal(sinSesion.status, 401);
    const invalido = await fetch(`${baseUrl}/v1/organizations/no-uuid/image`, { headers: { authorization: 'Bearer token' } });
    assert.equal(invalido.status, 400);
  });

  test('entrega la imagen privada sin caché compartida', async () => {
    const response = await fetch(`${baseUrl}/v1/organizations/${orgId}/image`, { headers: { authorization: 'Bearer token' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
  });
});
