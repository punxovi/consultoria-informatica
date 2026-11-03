import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../../src/lib/api/transporte.ts';
import { crearClienteImagenOrganizacion } from '../../src/lib/organizaciones/cliente.ts';
import {
  TAMANO_MAXIMO_IMAGEN_ORGANIZACION,
  validarImagenOrganizacion,
} from '../../src/lib/organizaciones/imagen.ts';

const idOrganizacion = '22222222-2222-4222-8222-222222222222';
const imagen = {
  id_archivo: '44444444-4444-4444-8444-444444444444',
  nombre_original: 'fachada.png',
  mime_type: 'image/png',
  tamano_bytes: 8,
  updated_at: '2026-11-03T00:00:00Z',
};

test('imagen de organización: valida tipo, extensión y tamaño antes de subir', () => {
  assert.equal(validarImagenOrganizacion({ name: 'fachada.png', type: 'image/png', size: 1024 }), null);
  assert.equal(validarImagenOrganizacion({ name: 'FOTO.JPEG', type: 'image/jpeg', size: 1024 }), null);
  assert.equal(validarImagenOrganizacion({ name: 'logo.webp', type: 'image/webp', size: TAMANO_MAXIMO_IMAGEN_ORGANIZACION }), null);
  assert.match(validarImagenOrganizacion({ name: 'acta.pdf', type: 'application/pdf', size: 10 }), /JPG, PNG o WebP/);
  assert.match(validarImagenOrganizacion({ name: 'anim.gif', type: 'image/gif', size: 10 }), /JPG, PNG o WebP/);
  assert.match(validarImagenOrganizacion({ name: 'falsa.pdf', type: 'image/png', size: 10 }), /JPG, PNG o WebP/);
  assert.match(validarImagenOrganizacion({ name: 'vacia.png', type: 'image/png', size: 0 }), /vacía/);
  assert.match(validarImagenOrganizacion({ name: 'grande.png', type: 'image/png', size: TAMANO_MAXIMO_IMAGEN_ORGANIZACION + 1 }), /5 MB/);
});

test('imagen de organización: sube el binario al gateway con su tipo y la sesión', async () => {
  const llamadas = [];
  const cliente = crearClienteImagenOrganizacion('http://gateway.test/', async () => 'jwt-de-prueba', async (url, init) => {
    llamadas.push({ url, init });
    return Response.json({ ok: true, code: 'IMAGEN_ORGANIZACION_GUARDADA', message: 'ok', data: { imagen } });
  });
  const archivo = new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], 'fachada nueva.png', { type: 'image/png' });

  const resultado = await cliente.subir(idOrganizacion, archivo);

  assert.deepEqual(resultado, imagen);
  const [{ url, init }] = llamadas;
  assert.equal(url, `http://gateway.test/api/v1/organizations/${idOrganizacion}/image?nombre=fachada%20nueva.png`);
  assert.equal(init.method, 'PUT');
  assert.equal(init.headers['content-type'], 'image/png');
  assert.equal(init.headers.authorization, 'Bearer jwt-de-prueba');
  assert.equal(init.body, archivo);
});

test('imagen de organización: conserva los errores del Backend y del tamaño', async () => {
  const rechazada = crearClienteImagenOrganizacion('http://gateway.test', async () => 'jwt', async () =>
    Response.json({ ok: false, error: { code: 'SIN_PERMISO', message: 'Sin permiso.', requestId: 'req-1' } }, { status: 403 }));
  await assert.rejects(
    rechazada.subir(idOrganizacion, new File(['x'], 'x.png', { type: 'image/png' })),
    (error) => error instanceof ApiError && error.code === 'SIN_PERMISO' && error.status === 403 && error.requestId === 'req-1',
  );

  const grande = crearClienteImagenOrganizacion('http://gateway.test', async () => 'jwt', async () =>
    new Response('Payload Too Large', { status: 413 }));
  await assert.rejects(
    grande.subir(idOrganizacion, new File(['x'], 'x.png', { type: 'image/png' })),
    (error) => error instanceof ApiError && error.status === 413 && /tamaño/.test(error.message),
  );

  const caida = crearClienteImagenOrganizacion('http://gateway.test', async () => 'jwt', async () => { throw new TypeError('offline'); });
  await assert.rejects(caida.descargar(idOrganizacion),
    (error) => error instanceof ApiError && error.code === 'SERVICIO_NO_DISPONIBLE');
});

test('imagen de organización: descarga la imagen privada como Blob sin caché', async () => {
  let solicitud;
  const cliente = crearClienteImagenOrganizacion('http://gateway.test', async () => 'jwt', async (url, init) => {
    solicitud = { url, init };
    return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } });
  });
  const blob = await cliente.descargar(idOrganizacion);
  assert.equal(blob.type, 'image/png');
  assert.equal(blob.size, 4);
  assert.equal(solicitud.url, `http://gateway.test/api/v1/organizations/${idOrganizacion}/image`);
  assert.equal(solicitud.init.cache, 'no-store');
  assert.equal(solicitud.init.headers.authorization, 'Bearer jwt');
});
