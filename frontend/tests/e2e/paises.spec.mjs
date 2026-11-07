import { expect, test } from '@playwright/test';

const chile = '15100000-0000-4000-8000-000000000001';
const peru = '15100000-0000-4000-8000-000000000002';
const now = '2026-10-29T12:00:00.000Z';

const country = (overrides = {}) => ({
  id_pais: chile,
  nombre: 'Chile',
  codigo_iso: 'CL',
  codigo_area_telefonica: '+56',
  zona_horaria: 'America/Santiago',
  version: 1,
  created_at: now,
  updated_at: now,
  configuracion_pendiente: false,
  ...overrides,
});

let countries;
let requests;
let denied;

const success = (data, status = 200) => ({ status, json: { ok: true, code: 'OK', message: 'ok', data } });
const failure = (status, code, message, fields) => ({ status, json: { ok: false, error: { code, message, ...(fields ? { fields } : {}) }, data: null } });

test.beforeEach(async ({ context }) => {
  countries = [country()];
  requests = [];
  denied = false;
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({
    access_token: 'qa-admin', refresh_token: 'qa-refresh', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '15100000-0000-4000-8000-000000000099', email: 'admin@example.test', user_metadata: {} },
  })));
  await context.route('http://127.0.0.1:54329/**', (route) => route.fulfill({
    json: [{ codigo: 'ADMIN', alcance: 'global', id_pais: null }],
  }));
  await context.route('**/api/v1/auth/session', (route) => route.fulfill({
    json: success({ authenticated: true, user: { id: '15100000-0000-4000-8000-000000000099' } }).json,
  }));
  await context.route('**/api/v1/countries**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const match = /^\/api\/v1\/countries(?:\/([^/]+))?$/.exec(path);
    const id = match?.[1];
    const body = request.postData() ? request.postDataJSON() : undefined;
    requests.push({ method: request.method(), path, body, authorization: request.headers().authorization });
    if (denied) return route.fulfill(failure(403, 'SIN_PERMISO', 'Administrador requerido.'));
    if (request.method() === 'GET' && !id) return route.fulfill(success({ countries }));
    const selected = countries.find((item) => item.id_pais === id);
    if (request.method() === 'GET') return selected
      ? route.fulfill(success({ country: selected }))
      : route.fulfill(failure(404, 'PAIS_NO_ENCONTRADO', 'No existe.'));
    if (request.method() === 'POST') {
      const created = country({ ...body, id_pais: peru });
      countries.push(created);
      return route.fulfill(success({ country: created }, 201));
    }
    if (request.method() === 'PATCH' && selected) {
      Object.assign(selected, body.cambios, { version: selected.version + 1, updated_at: now });
      return route.fulfill(success({ country: selected }));
    }
    return route.fulfill(failure(405, 'METODO_NO_PERMITIDO', 'Método no permitido.'));
  });
});

test('lista datos reales del cliente HTTP y muestra una autorización denegada', async ({ page }) => {
  await page.goto('/administracion/paises');
  await expect(page.locator('#paises-lista article')).toHaveCount(1);
  await expect(page.locator('#paises-lista')).toContainText('Chile');
  expect(requests[0]).toMatchObject({ method: 'GET', path: '/api/v1/countries', authorization: 'Bearer qa-admin' });

  denied = true;
  await page.reload();
  await expect(page.locator('#paises-error')).toContainText('Solo un Administrador puede administrar los países.');
  await expect(page.locator('#paises-total')).toHaveText('0');
  await expect(page.locator('#paises-lista')).toBeHidden();
});

test('crear envía el contrato acordado y recarga el listado confirmado por el servicio', async ({ page }) => {
  await page.goto('/administracion/paises/nuevo');
  await page.locator('#nombre').fill('Perú');
  await page.locator('#codigo_iso').fill('pe');
  await page.locator('#codigo_area_telefonica').fill('+51');
  await page.locator('#zona_horaria').fill('America/Lima');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/administracion\/paises\?resultado=creado$/);
  await expect(page.locator('#paises-confirmacion')).toHaveText('País creado correctamente.');
  await expect(page.locator('#paises-lista article')).toHaveCount(2);
  expect(requests.find((request) => request.method === 'POST')).toMatchObject({
    path: '/api/v1/countries',
    body: { nombre: 'Perú', codigo_iso: 'PE', codigo_area_telefonica: '+51', zona_horaria: 'America/Lima' },
  });
});

test('editar consulta la versión y envía únicamente los campos modificados', async ({ page }) => {
  await page.goto(`/administracion/paises/${chile}/editar`);
  await expect(page.locator('#nombre')).toHaveValue('Chile');
  await page.locator('#zona_horaria').fill('America/Punta_Arenas');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/\/administracion\/paises\?resultado=actualizado$/);
  await expect(page.locator('#paises-lista')).toContainText('America/Punta_Arenas');
  expect(requests.find((request) => request.method === 'PATCH')).toMatchObject({
    path: `/api/v1/countries/${chile}`,
    body: { version_esperada: 1, cambios: { zona_horaria: 'America/Punta_Arenas' } },
  });
});
