import { test, expect } from '@playwright/test';

let id;
const campos = {
  mision: 'Apoyar a la comunidad', vision: 'Una comunidad organizada',
  'caracteristicas-infraestructura': 'Sede comunitaria', 'espacios-disponibles': 'Salón y cocina',
  'recursos-existentes': 'Mesas y sillas', 'danos-detectados': 'Humedad en el techo',
  'necesidades-prioritarias': 'Reparar el techo', observaciones: 'Visita inicial',
};
test.beforeEach(async ({ context, request }) => {
  const response = await request.post(`${process.env.QA_DIAGNOSTICO_SUPABASE}/__qa/organization`, { headers: { authorization: 'Bearer qa-admin' } });
  expect(response.ok()).toBe(true);
  id = (await response.json()).id_organizacion;
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({
    access_token: 'qa-admin', refresh_token: 'qa-refresh', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '17600000-0000-4000-8000-000000000001', email: 'qa@example.invalid', user_metadata: {} },
  })));
  // Auth es el único dominio simulado; Diagnóstico y Organización atraviesan el Gateway real.
  await context.route('**/api/v1/auth/session', route => route.fulfill({ json: { ok: true, data: { authenticated: true, user: { id: '17600000-0000-4000-8000-000000000001' } } } }));
});

async function abrir(page) {
  await page.goto(`/organizaciones/${id}`);
  await page.locator('[data-tab="diagnostico"]').click();
}
async function completar(page) {
  for (const [campo, valor] of Object.entries(campos)) await page.locator(`#diagnostico-organizacion #${campo}`).fill(valor);
  await page.locator('#raciones').fill('25');
  await page.locator('#periodo-raciones').selectOption('semanal');
}
async function crear(page) {
  await abrir(page);
  await page.locator('#btn-registrar-diagnostico').click();
  await completar(page);
  await page.locator('#btn-guardar-diagnostico').click();
  await expect(page.locator('#diagnostico-confirmacion')).toContainText('guardado correctamente');
}

test('crea y edita desde el formulario, confirma y persiste al recargar mediante Gateway y SQL', async ({ page }) => {
  const errores = []; page.on('pageerror', error => errores.push(error.message));
  const escrituras = []; page.on('request', req => { if (/\/diagnosticos/.test(req.url()) && ['POST', 'PATCH'].includes(req.method())) escrituras.push(req); });
  await crear(page);
  await abrir(page);
  await expect(page.locator('#resumen-mision')).toHaveText(campos.mision);
  await page.locator('#btn-registrar-diagnostico').click();
  await expect(page.locator('#mision')).toHaveValue(campos.mision);
  await page.locator('#mision').fill('Misión actualizada desde la interfaz');
  await page.locator('#raciones').fill('');
  await page.locator('#periodo-raciones').selectOption('');
  await page.locator('#btn-guardar-diagnostico').click();
  await expect(page.locator('#diagnostico-confirmacion')).toContainText('actualizado correctamente');
  await abrir(page);
  await expect(page.locator('#resumen-mision')).toHaveText('Misión actualizada desde la interfaz');
  await expect(page.locator('#resumen-raciones')).toHaveText('No informado');
  expect(escrituras.map(r => r.method())).toEqual(['POST', 'PATCH']);
  expect(escrituras[1].postDataJSON().version_esperada).toBe(1);
  expect(escrituras.every(r => r.url().startsWith(process.env.QA_DIAGNOSTICO_GATEWAY))).toBe(true);
  expect(errores).toEqual([]);
});

test('valida campos, asocia los errores y bloquea campos y dobles envíos durante el guardado', async ({ page }) => {
  await abrir(page);
  await page.locator('#btn-registrar-diagnostico').click();
  await page.locator('#btn-guardar-diagnostico').click();
  await expect(page.locator('#necesidades-prioritarias-error')).toContainText('obligatorio');
  await completar(page);
  await page.locator('#periodo-raciones').selectOption('');
  await page.locator('#btn-guardar-diagnostico').click();
  await expect(page.locator('#periodo-raciones-error')).toContainText('periodicidad');
  await page.locator('#periodo-raciones').selectOption('diaria');
  let liberar; const espera = new Promise(resolve => { liberar = resolve; });
  let envios = 0;
  await page.route('**/diagnosticos', async route => {
    if (route.request().method() === 'POST') { envios++; await espera; }
    await route.continue();
  });
  await page.locator('#btn-guardar-diagnostico').click();
  await expect(page.locator('#mision')).toBeDisabled();
  await expect(page.locator('#btn-cancelar-diagnostico')).toBeDisabled();
  await page.locator('#form-diagnostico').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
  liberar();
  await expect(page.locator('#diagnostico-confirmacion')).toBeVisible();
  expect(envios).toBe(1);
});

test('error de carga es distinto del estado vacío y permite reintentar', async ({ page }) => {
  await page.route('**/diagnosticos', route => route.fulfill({ status: 503, json: { ok: false, error: { code: 'SUPABASE_NO_DISPONIBLE', message: 'No fue posible conectar con la base de datos.' } } }));
  await abrir(page);
  await expect(page.locator('#diagnostico-error')).toContainText('base de datos');
  await expect(page.locator('#estado-sin-diagnostico')).toBeHidden();
  await expect(page.locator('#btn-registrar-diagnostico')).toBeHidden();
  await page.unroute('**/diagnosticos');
  await page.locator('#btn-recargar-diagnostico').click();
  await expect(page.locator('#estado-sin-diagnostico')).toBeVisible();
});

test('un fallo al guardar conserva el borrador y permite reintentar sin mostrar confirmación', async ({ page }) => {
  await abrir(page); await page.locator('#btn-registrar-diagnostico').click(); await completar(page);
  await page.route('**/diagnosticos', route => route.fulfill({ status: 403, json: { ok: false, error: { code: 'SIN_PERMISO', message: 'No tienes permiso para guardar.' } } }));
  await page.locator('#btn-guardar-diagnostico').click();
  await expect(page.locator('#diagnostico-error')).toHaveText('No tienes permiso para guardar.');
  await expect(page.locator('#mision')).toHaveValue(campos.mision);
  await expect(page.locator('#diagnostico-confirmacion')).toBeHidden();
  await page.unroute('**/diagnosticos');
  await page.locator('#btn-guardar-diagnostico').click();
  await expect(page.locator('#diagnostico-confirmacion')).toBeVisible();
});

test('conflicto real entre pestañas conserva el borrador y permite recargar la versión vigente', async ({ page, context }) => {
  await crear(page);
  const otra = await context.newPage(); await abrir(otra);
  for (const tab of [page, otra]) await tab.locator('#btn-registrar-diagnostico').click();
  await page.locator('#mision').fill('Versión de la primera pestaña');
  await otra.locator('#mision').fill('Mi borrador');
  await page.locator('#btn-guardar-diagnostico').click();
  await expect(page.locator('#diagnostico-confirmacion')).toContainText('actualizado');
  await otra.locator('#btn-guardar-diagnostico').click();
  await expect(otra.locator('#diagnostico-error')).toContainText('otra sesión');
  await expect(otra.locator('#mision')).toHaveValue('Mi borrador');
  await expect(otra.locator('#btn-guardar-diagnostico')).toBeDisabled();
  otra.once('dialog', dialog => dialog.dismiss());
  await otra.locator('#btn-recargar-diagnostico').click();
  await expect(otra.locator('#mision')).toHaveValue('Mi borrador');
  otra.once('dialog', dialog => dialog.accept());
  await otra.locator('#btn-recargar-diagnostico').click();
  await expect(otra.locator('#resumen-mision')).toHaveText('Versión de la primera pestaña');
  await otra.close();
});

test('carga visible, cancelar conserva el registro y formulario usable en móvil', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let liberar; const espera = new Promise(resolve => { liberar = resolve; });
  await page.route('**/diagnosticos', async route => { await espera; await route.continue(); });
  await abrir(page);
  await expect(page.locator('#diagnostico-carga')).toBeVisible();
  await expect(page.locator('#btn-registrar-diagnostico')).toBeHidden();
  liberar();
  await expect(page.locator('#estado-sin-diagnostico')).toBeVisible();
  await page.locator('#btn-registrar-diagnostico').click(); await completar(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('diagnostico-movil.png'), fullPage: true });
  await page.locator('#btn-cancelar-diagnostico').click();
  await expect(page.locator('#estado-sin-diagnostico')).toBeVisible();
});
