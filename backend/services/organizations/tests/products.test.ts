import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Server } from 'node:http';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import { productCreateSchema, productUpdateSchema, productStateSchema, productFilters, parseProduct } from '../src/domain/products.ts';
import { createSupabaseProductsRepository } from '../src/infrastructure/supabase-products.repository.ts';
import { createProductsApplication } from '../src/application/products-service.ts';
import { createOrganizationsServer } from '../src/server.ts';
import { createGatewayServer } from '../../../gateway/src/server.ts';

const id = '16200000-0000-4000-8000-000000000001';
const org = '16200000-0000-4000-8000-000000000002';
const country = '16200000-0000-4000-8000-000000000003';
const input = { id_organizacion: org, nombre: ' Bolso ', descripcion: 'Tela reciclada', unidad_medida: 'unidad' };
const publicProduct = { id_producto: id, nombre: 'Bolso', descripcion: 'Tela reciclada', unidad_medida: 'unidad', tipo_item: 'producto',
  categoria: null, material_terminacion: null, caracteristicas: {}, informacion_adicional: null,
  organizacion: { id_organizacion: org, nombre: 'Organización QA' }, pais: { id_pais: country, nombre: 'Chile', codigo_iso: 'CL' }, imagenes: [] };

test('productos: entrada estricta, edición con versión y filtros combinables', () => {
  const created = parseProduct(productCreateSchema, input);
  assert.equal(created.nombre, 'Bolso'); assert.equal(created.tipo_item, 'producto'); assert.deepEqual(created.caracteristicas, {});
  for (const field of Object.keys(input)) { const bad: Record<string, unknown> = { ...input }; delete bad[field]; assert.throws(() => parseProduct(productCreateSchema, bad)); }
  for (const bad of [{ ...input, publicado: true }, { ...input, stock: 10 }, { ...input, id_organizacion: 'bad' }, { ...input, caracteristicas: [] }, { ...input, nombre: ' ' }, { ...input, tipo_item: 'stock' }]) assert.throws(() => parseProduct(productCreateSchema, bad));
  assert.equal(parseProduct(productUpdateSchema, { version_esperada: 1, cambios: { categoria: null } }).cambios.categoria, null);
  for (const bad of [{ version_esperada: 0, cambios: { nombre: 'A' } }, { version_esperada: 1, cambios: {} }, { version_esperada: 1, cambios: { publicado: true } }, { version_esperada: 1, cambios: { id_organizacion: org } }]) assert.throws(() => parseProduct(productUpdateSchema, bad));
  for (const bad of [{}, { version_esperada: Infinity }, { version_esperada: '1' }, { version_esperada: 1.5 }]) assert.throws(() => parseProduct(productStateSchema, bad));
  assert.deepEqual(productFilters(new URL(`http://qa/?id_pais=${country}&id_organizacion=${org}&limit=10`)), { id_pais: country, id_organizacion: org, limit: 10, offset: 0 });
  for (const query of ['id_pais=', `id_pais=${country}&id_pais=${country}`, 'limit=0', 'limit=101', 'offset=-1', 'publicado=false', '__proto__=x']) assert.throws(() => productFilters(new URL('http://qa/?'+query)));
});

test('productos: contrato público elimina datos internos, contactos y autorización del visitante', async () => {
  const repo = createSupabaseProductsRepository({ supabaseUrl: 'https://example.supabase.co', anonKey: 'public-key', fetchImpl: async (url, init) => {
    assert.equal(new Headers(init?.headers).get('apikey'), 'public-key');
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    assert.ok(String(url).endsWith('/consultar_productos_publicos'));
    return Response.json({ ...publicProduct, created_by: 'internal-user', version: 3, ruta_objeto: 'private', organizacion: { ...publicProduct.organizacion, telefono: 'private-phone', correo: 'private-email' } });
  } });
  const result = await repo.execute('ignored-token', 'get', { id_producto: id }, true);
  assert.deepEqual(result, publicProduct);
  assert.equal(JSON.stringify(result).includes('private'), false);
});

test('productos: JWT, errores de permisos, inexistentes, versiones, red y contrato', async () => {
  const options = { supabaseUrl: 'https://example.supabase.co', anonKey: 'public-key' };
  const ok = createSupabaseProductsRepository({ ...options, fetchImpl: async (_url, init) => {
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer real-user-jwt');
    return Response.json({ authorized: true });
  } });
  await ok.execute('real-user-jwt', 'authorize', {});
  await assert.rejects(ok.execute(undefined, 'authorize', {}), { code: 'SESION_REQUERIDA' });
  for (const [code, expected, status] of [['42501','SIN_PERMISO',403], ['P0162','PRODUCTO_NO_ENCONTRADO',404], ['P0163','ORGANIZACION_NO_ENCONTRADA',404], ['P0164','ORGANIZACION_INACTIVA',409], ['P0165','FILTRO_NO_ENCONTRADO',404], ['40001','CONFLICTO_VERSION',409], ['22023','DATOS_INVALIDOS',400], ['PGRST202','MIGRACION_PRODUCTOS_PENDIENTE',503]] as const) {
    const repo = createSupabaseProductsRepository({ ...options, fetchImpl: async () => Response.json({ code, message: 'private-provider' }, { status: 400 }) });
    await assert.rejects(repo.execute('jwt', 'create', {}), e => e instanceof ServiceError && e.code === expected && e.status === status && !e.message.includes('private-provider'));
  }
  for (const [fetchImpl, expected] of [[async () => { throw new Error('offline'); }, 'PRODUCTOS_NO_DISPONIBLES'], [async () => new Response('not-json'), 'RESPUESTA_INVALIDA'], [async () => Response.json({}), 'RESPUESTA_INVALIDA'], [async () => Response.json({}, { status: 401 }), 'SESION_INVALIDA']] as const) {
    await assert.rejects(createSupabaseProductsRepository({ ...options, fetchImpl }).execute('jwt', 'get', {}), { code: expected });
  }
  await assert.rejects(createSupabaseProductsRepository({ supabaseUrl: '', anonKey: '' }).execute('jwt', 'authorize', {}), { code: 'CONFIGURACION_SUPABASE' });
});

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No address');
  return new URL(`http://127.0.0.1:${address.port}`);
}
test('productos HTTP por Gateway: administración, consultas públicas y denegaciones', async () => {
  let product = { ...publicProduct, id_organizacion: org, version: 1, publicado: false };
  let writes = 0;
  const repo = createSupabaseProductsRepository({ supabaseUrl: 'https://qa.invalid', anonKey: 'public', fetchImpl: async (url, init) => {
    const body = JSON.parse(String(init?.body)), op = body.p_operacion, data = body.p_datos;
    if (String(url).endsWith('/consultar_productos_publicos')) {
      assert.equal(new Headers(init?.headers).has('authorization'), false);
      return op === 'list' ? Response.json({ products: product.publicado ? [publicProduct] : [], limit: data.limit, offset: data.offset, hasMore: false })
        : product.publicado ? Response.json(publicProduct) : Response.json({ code: 'P0162' }, { status: 400 });
    }
    if (new Headers(init?.headers).get('authorization') !== 'Bearer admin') return Response.json({ code: '42501' }, { status: 403 });
    if (op === 'authorize') return Response.json({ authorized: true });
    if (op === 'list') return Response.json({ products: [product], limit: data.limit, offset: data.offset, hasMore: false });
    if (op === 'get' && data.id_producto !== id) return Response.json({ code: 'P0162' }, { status: 404 });
    if (['create','update','activate','deactivate'].includes(op)) {
      writes++;
      if (op !== 'create' && data.version_esperada !== product.version) return Response.json({ code: '40001' }, { status: 409 });
      if (op === 'update') product = { ...product, ...data.cambios };
      if (op === 'activate' || op === 'deactivate') product.publicado = op === 'activate';
      if (op !== 'create') product.version++;
    }
    return Response.json(product);
  } });
  const service = createOrganizationsServer(undefined, undefined, undefined, undefined, createProductsApplication(repo));
  const gateway = createGatewayServer({ targets: { organizations: await listen(service) } });
  const url = (await listen(gateway)).href.replace(/\/$/, '') + '/api/v1';
  const request = async (path: string, method = 'GET', body?: unknown, token?: string) => {
    const response = await fetch(url+path, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-user-id': 'forged-admin' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  try {
    assert.equal((await request('/products')).status, 401);
    for (const path of ['/products', `/products/${id}`]) assert.equal((await request(path, 'GET', undefined, 'coord')).status, 403);
    assert.equal((await request('/products', 'POST', {}, 'coord')).status, 403);
    assert.equal((await request('/products', 'POST', {}, 'admin')).status, 400); assert.equal(writes, 0);
    assert.equal((await request('/products', 'POST', input, 'admin')).status, 201);
    assert.equal((await request(`/products/${id}`, 'GET', undefined, 'admin')).status, 200);
    assert.equal((await request('/products?id_pais=bad', 'GET', undefined, 'admin')).status, 400);
    assert.equal((await request('/public/products')).body.data.products.length, 0);
    assert.equal((await request(`/public/products/${id}`)).status, 404);
    assert.equal((await request(`/products/${id}`, 'PATCH', { version_esperada: 1, cambios: { nombre: 'Nuevo' } }, 'admin')).status, 200);
    assert.equal((await request(`/products/${id}/activate`, 'POST', { version_esperada: 2 }, 'admin')).status, 200);
    assert.equal((await request(`/public/products?id_pais=${country}&id_organizacion=${org}`)).body.data.products.length, 1);
    assert.equal((await request(`/public/products/${id}`, 'GET', undefined, 'ignored')).status, 200);
    assert.equal((await request(`/products/${id}/deactivate`, 'POST', { version_esperada: 2 }, 'admin')).status, 409);
    assert.equal((await request(`/products/${id}/deactivate`, 'POST', { version_esperada: 3 }, 'admin')).status, 200);
    assert.equal((await request('/public/products')).body.data.products.length, 0);
    assert.equal((await request('/public/products', 'POST', input)).status, 405);
    assert.equal((await request('/public/products?limit=0')).status, 400);
    assert.equal((await request(`/public/products?id_pais=${country}&id_pais=${country}`)).status, 400);
    assert.equal((await request('/products/not-a-uuid', 'GET', undefined, 'admin')).status, 400);
    assert.equal((await request('/products', 'DELETE', undefined, 'admin')).status, 405);
  } finally {
    gateway.closeAllConnections(); service.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => gateway.close(() => resolve())), new Promise<void>(resolve => service.close(() => resolve()))]);
  }
});
