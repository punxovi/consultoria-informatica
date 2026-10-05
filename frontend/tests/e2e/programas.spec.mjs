import { test, expect } from '@playwright/test';

const uid = '17600000-0000-4000-8000-000000000001';
const inexistente = '00000000-0000-4000-8000-000000000000';
const api = '**/api/v1/programs';
const ok = data => ({ ok: true, code: 'QA_OK', message: 'OK', data });
const fallo = (code, message) => ({ ok: false, error: { code, message }, data: null });

async function sesion(context, rol = 'ADMIN') {
  await context.addInitScript(({ rol, uid }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: rol === 'ADMIN' ? 'qa-admin' : 'qa-coord', refresh_token: 'qa-refresh',
      token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: uid, email: 'qa@example.test', user_metadata: {} },
    }));
  }, { rol, uid });
  // Auth y Storage quedan fuera de este alcance. Gateway, servicio Programas,
  // repositorio, función SQL, RLS y persistencia sí se ejecutan realmente.
  await context.route('**/api/v1/auth/session', route => route.fulfill({ json: ok({ authenticated: true, user: { id: uid, email: 'qa@example.test' } }) }));
  await context.route('**/rest/v1/archivos**', route => route.fulfill({ json: null }));
}

async function completar(page, nombre = 'Programa QA SCRUM-41') {
  for (const [campo, valor] of Object.entries({ nombre, descripcion: 'Descripción de prueba', objetivo_general: 'Fortalecer equipos', objetivos_especificos: 'Capacitar organizaciones' })) {
    await page.locator(`#${campo}`).fill(valor);
  }
  await page.locator('[data-campo="linea_accion"]').first().fill('Formación');
  await page.locator('[data-campo="resultado_esperado"]').first().fill('Equipos capacitados');
}

async function nuevo(page) {
  await page.goto('/programas/nuevo');
  await expect(page.locator('#programa-campos')).toBeEnabled();
}

test.beforeEach(async ({ context }) => sesion(context));

test('lista datos reales, crea y edita líneas, y conserva cambios al recargar', async ({ page }) => {
  const errores = []; page.on('pageerror', error => errores.push(error.message));
  await page.goto('/programas');
  await expect(page.locator('#programas-listado article')).toHaveCount(6);
  await page.getByRole('link', { name: '+ Nuevo programa' }).click();
  await expect(page.locator('#programa-campos')).toBeEnabled();
  await page.getByRole('button', { name: 'Guardar programa' }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(6);
  await completar(page);
  await page.getByRole('button', { name: 'Agregar línea de acción' }).click();
  await page.locator('[data-campo="linea_accion"]').nth(1).fill('formación');
  await page.locator('[data-campo="resultado_esperado"]').nth(1).fill('Resultado adicional');
  await page.locator('#guardar-programa').click();
  await expect(page.getByText(/está repetida/)).toBeVisible();
  await page.locator('[data-campo="linea_accion"]').nth(1).fill('Acompañamiento');
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-confirmacion')).toBeVisible();
  await expect(page.locator('#detalle-lineas dt')).toHaveText(['Formación', 'Acompañamiento']);
  await page.reload();
  await expect(page.locator('#detalle-nombre')).toHaveText('Programa QA SCRUM-41');
  await page.getByRole('link', { name: 'Editar programa' }).click();
  await expect(page.locator('#nombre')).toHaveValue('Programa QA SCRUM-41');
  await page.getByRole('button', { name: 'Quitar línea 1', exact: true }).click();
  await page.locator('#nombre').fill('Programa QA actualizado');
  await page.locator('[data-campo="resultado_esperado"]').fill('Organizaciones fortalecidas');
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#detalle-lineas dt')).toHaveText(['Acompañamiento']);
  await expect(page.locator('#detalle-lineas dd')).toHaveText(['Organizaciones fortalecidas']);
  await page.reload();
  await expect(page.locator('#detalle-nombre')).toHaveText('Programa QA actualizado');
  await page.screenshot({ path: test.info().outputPath('detalle-persistido.png'), fullPage: true });
  await page.goto('/programas');
  await expect(page.getByRole('heading', { name: 'Programa QA actualizado' })).toBeVisible();
  expect(errores).toEqual([]);
});

test('edita un programa legado sin perder sus textos ni inventar líneas', async ({ page }) => {
  await page.goto('/programas');
  await page.locator('#programas-listado a').first().click();
  await expect(page.locator('#detalle-legado')).toBeVisible();
  const componentes = await page.locator('#detalle-componentes').textContent();
  const resultados = await page.locator('#detalle-resultados').textContent();
  await page.getByRole('link', { name: 'Editar programa' }).click();
  await expect(page.locator('#programa-legado')).toBeVisible();
  await expect(page.locator('[data-campo="linea_accion"]')).toHaveCount(0);
  await page.locator('#descripcion').fill('Contexto actualizado sin líneas nuevas');
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#detalle-componentes')).toHaveText(componentes);
  await expect(page.locator('#detalle-resultados')).toHaveText(resultados);
});

test('muestra carga y error del listado, y permite reintentar', async ({ page }) => {
  let liberar;
  const espera = new Promise(resolve => { liberar = resolve; });
  await page.route(api, async route => {
    await espera;
    await route.fulfill({ status: 502, json: fallo('ERROR_BASE_DATOS', 'Fallo de consulta de prueba') });
  });
  await page.goto('/programas');
  await expect(page.locator('#programas-estado')).toHaveText('Cargando programas…');
  await expect(page.locator('#recargar-programas')).toBeDisabled();
  liberar();
  await expect(page.locator('#programas-error')).toHaveText('Fallo de consulta de prueba');
  await expect(page.locator('#programas-estado')).toBeEmpty();
  await page.unroute(api);
  await page.locator('#recargar-programas').click();
  await expect(page.locator('#programas-listado article').first()).toBeVisible();
});

test('distingue catálogo vacío, programa inexistente, ID inválido y fallo de detalle', async ({ page }) => {
  await page.route(api, route => route.fulfill({ json: ok({ programs: [] }) }));
  await page.goto('/programas');
  await expect(page.locator('#programas-estado')).toContainText('No hay programas');
  await expect(page.locator('#programas-error')).toBeHidden();
  await page.goto(`/programas/${inexistente}`);
  await expect(page.locator('#detalle-estado')).toHaveText('Programa no encontrado');
  await expect(page.locator('#programa-recuperacion')).toBeHidden();
  const respuesta = await page.goto('/programas/id-invalido');
  expect(respuesta.status()).toBe(404);
  await expect(page.locator('#detalle-estado')).toHaveText('Programa no encontrado');
  await page.route(`${api}/${inexistente}`, route => route.fulfill({ status: 503, body: 'Error de prueba' }));
  await page.goto(`/programas/${inexistente}`);
  await expect(page.locator('#detalle-estado')).toHaveText('No fue posible cargar el programa');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});

test('guardado lento bloquea dobles envíos y el error conserva el borrador', async ({ page }) => {
  await nuevo(page); await completar(page, 'Guardado lento');
  let liberar; let llamadas = 0;
  const espera = new Promise(resolve => { liberar = resolve; });
  await page.route(api, async route => {
    llamadas++; await espera;
    await route.fulfill({ status: 403, json: fallo('SIN_PERMISO', 'Permiso de escritura revocado') });
  });
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-estado')).toHaveText('Guardando programa…');
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#nombre')).toBeDisabled();
  await expect(page.locator('#guardar-programa')).toBeDisabled();
  await page.locator('#programa-form').dispatchEvent('submit');
  expect(llamadas).toBe(1); liberar();
  await expect(page.locator('#programa-errores')).toHaveText('Permiso de escritura revocado');
  await expect(page.locator('#nombre')).toHaveValue('Guardado lento');
  await expect(page.locator('#programa-campos')).toBeEnabled();
  await page.unroute(api);
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#detalle-nombre')).toHaveText('Guardado lento');
});

test('conflicto entre pestañas conserva el borrador y permite recargar', async ({ page, context }) => {
  await nuevo(page); await completar(page, 'Prueba concurrente');
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#detalle-nombre')).toHaveText('Prueba concurrente');
  const ruta = new URL(page.url()).pathname;
  await page.goto(`${ruta}/editar`);
  const segunda = await context.newPage(); await segunda.goto(`${ruta}/editar`);
  await expect(segunda.locator('#nombre')).toHaveValue('Prueba concurrente');
  await page.locator('#nombre').fill('Versión guardada por otra pestaña');
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#detalle-nombre')).toHaveText('Versión guardada por otra pestaña');
  await segunda.locator('#nombre').fill('Mi cambio pendiente');
  await segunda.locator('#guardar-programa').click();
  await expect(segunda.locator('#programa-errores')).toContainText('otra sesión');
  await expect(segunda.locator('#nombre')).toHaveValue('Mi cambio pendiente');
  segunda.once('dialog', dialog => dialog.accept());
  await segunda.locator('#recargar-programa').click();
  await expect(segunda.locator('#nombre')).toHaveValue('Versión guardada por otra pestaña');
});

test('coordinador consulta y la base rechaza creación o edición forzada', async ({ page, context }) => {
  await sesion(context, 'COORD');
  await page.goto('/programas');
  await expect(page.locator('#programas-listado article').first()).toBeVisible();
  await expect(page.locator('#crear-programa-panel')).toBeHidden();
  await page.locator('#programas-listado a').first().click();
  await expect(page.locator('#detalle-contenido')).toBeVisible();
  await expect(page.locator('#editar-programa-enlace')).toBeHidden();
  const id = new URL(page.url()).pathname.split('/').pop();
  const cuerpo = { nombre: 'Intento', descripcion: 'Descripción', objetivo_general: 'Objetivo', objetivos_especificos: 'Objetivos', lineas_accion: [{ linea_accion: 'Línea', resultado_esperado: 'Resultado' }] };
  const headers = { Authorization: 'Bearer qa-coord' };
  const crear = await page.request.post('http://127.0.0.1:4000/api/v1/programs', { headers, data: cuerpo });
  expect(crear.status()).toBe(403);
  expect((await crear.json()).error.code).toBe('SIN_PERMISO');
  const editar = await page.request.patch(`http://127.0.0.1:4000/api/v1/programs/${id}`, { headers, data: { cambios: { nombre: 'Intento no autorizado' } } });
  expect(editar.status()).toBe(403);
  await page.goto('/programas/nuevo');
  await expect(page.locator('#unauthorized-message')).toBeVisible();
});

test('funciona en móvil y muestra errores de validación del servidor', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await nuevo(page); await completar(page);
  await page.route(api, route => route.fulfill({ status: 400, json: fallo('VALIDACION', 'Resultado rechazado por el servidor') }));
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-errores')).toContainText('Resultado rechazado por el servidor');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: test.info().outputPath('formulario-movil.png'), fullPage: true });
});

test('sesión expirada conserva el borrador y evita una creación anónima', async ({ page }) => {
  await nuevo(page); await completar(page, 'Borrador con sesión expirada');
  await page.evaluate(() => localStorage.removeItem('sb-127-auth-token'));
  let llamadas = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/v1/programs')) llamadas++; });
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-errores')).toContainText('sesión expiró');
  await expect(page.locator('#nombre')).toHaveValue('Borrador con sesión expirada');
  expect(llamadas).toBe(0);
});
