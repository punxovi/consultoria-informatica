import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createPublicCatalogApplication } from '../src/application/public-catalog-service.ts';

const ID = '33333333-3333-4333-8333-333333333333';
const RUTA = 'productos/11111111-1111-4111-8111-111111111111/44444444-4444-4444-8444-444444444444.png';

function crear(filas: unknown[], serverKey = 'clave-servidor') {
  const llamadas: { url: string; headers: Record<string, string> }[] = [];
  const fetchImpl = (async (input: string | URL, init: RequestInit = {}) => {
    const url = String(input);
    llamadas.push({ url, headers: init.headers as Record<string, string> });
    if (url.endsWith('/rest/v1/rpc/obtener_imagen_producto_publica')) return Response.json(filas);
    if (url.includes('/storage/v1/object/authenticated/fge-archivos/')) return new Response('png-bytes');
    if (url.includes('/rest/v1/catalogo_cotizacion_publico') && url.includes('imagenes')) return Response.json({ code: '42703' }, { status: 400 });
    if (url.includes('/rest/v1/catalogo_cotizacion_publico')) return Response.json([]);
    return new Response(null, { status: 500 });
  }) as typeof fetch;
  return { app: createPublicCatalogApplication({ supabaseUrl: 'https://supabase.test', anonKey: 'anon', serverKey, fetchImpl }), llamadas };
}

describe('imágenes del catálogo público', () => {
  test('resuelve con la clave de servidor y descarga solo productos/', async () => {
    const { app, llamadas } = crear([{ bucket_id: 'fge-archivos', ruta_objeto: RUTA, mime_type: 'image/png', tamano_bytes: 9 }]);
    const imagen = await app.image(ID);
    assert.equal(imagen.mimeType, 'image/png');
    assert.equal(imagen.bytes.toString(), 'png-bytes');
    assert.equal(llamadas[0].headers.apikey, 'clave-servidor');
    assert.ok(llamadas[1].url.endsWith(`/storage/v1/object/authenticated/fge-archivos/${RUTA}`));
  });

  test('un producto no publicado o una ruta ajena no se entrega', async () => {
    await assert.rejects(crear([]).app.image(ID), { code: 'IMAGEN_NO_ENCONTRADA', status: 404 });
    await assert.rejects(crear([{ bucket_id: 'fge-archivos', ruta_objeto: 'organizaciones/x.png', mime_type: 'image/png' }]).app.image(ID), { status: 404 });
    await assert.rejects(crear([]).app.image('../secreto'), { status: 404 });
  });

  test('sin clave de servidor responde no configurado', async () => {
    await assert.rejects(crear([], '').app.image(ID), { code: 'IMAGENES_NO_CONFIGURADAS', status: 503 });
  });

  test('sin la migración de imágenes el catálogo sigue disponible', async () => {
    assert.deepEqual(await crear([]).app.list(), []);
  });
});
