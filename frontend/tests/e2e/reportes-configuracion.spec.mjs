import { test, expect } from '@playwright/test';
const id = '13700000-0000-4000-8000-000000000001';
const idOtro = '13700000-0000-4000-8000-000000000002';
const paises = [{ id_pais: id, nombre: 'Chile', codigo_iso: 'CL' }, { id_pais: idOtro, nombre: 'Perú', codigo_iso: 'PE' }];
const orgBase = { id_pais: id, version: 1, archived_at: null };
const organizaciones = [
  { ...orgBase, id_organizacion: '13700000-0000-4000-8000-0000000000a1', nombre: 'Comedor Las Palmas' },
  { ...orgBase, id_organizacion: '13700000-0000-4000-8000-0000000000a2', nombre: 'Centro Esperanza' },
];
const programas = [{ id_programa: '13700000-0000-4000-8000-0000000000b1', nombre: 'Programa Alimentación', archived_at: null, lineas_accion: [] }];
const catalogo = [
  { id_indicador: '13700000-0000-4000-8000-0000000000c1', codigo: '13700000-0000-4000-8000-0000000000c1', nombre: 'Raciones entregadas', unidad_medida: 'raciones', descripcion: 'Total de raciones' },
  { id_indicador: '13700000-0000-4000-8000-0000000000c2', codigo: '13700000-0000-4000-8000-0000000000c2', nombre: 'Familias atendidas', unidad_medida: 'familias', descripcion: 'Familias' },
];
let consultasOrganizaciones;
test.beforeEach(async ({ context }) => {
  consultasOrganizaciones = [];
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'qa-admin', refresh_token: 'qa-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '13700000-0000-4000-8000-000000000001', email: 'qa@example.test', user_metadata: {} } })));
  await context.route('http://127.0.0.1:54329/**', (r) => r.fulfill({ json: [{ codigo: 'COORD', alcance: 'global', id_pais: null }] }));
  await context.route('**/api/v1/auth/session', (r) => r.fulfill({ json: { ok: true, data: { authenticated: true, user: { id } } } }));
  await context.route('**/api/v1/programs', (r) => r.fulfill({ json: { ok: true, data: { programs: programas } } }));
  await context.route('**/api/v1/indicators/catalog', (r) => r.fulfill({ json: { ok: true, data: { catalogo } } }));
  await context.route('**/api/v1/organizations**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith('/countries')) return r.fulfill({ json: { ok: true, data: { countries: paises } } });
    consultasOrganizaciones.push(url.searchParams.get('id_pais'));
    return r.fulfill({ json: { ok: true, data: { organizations: organizaciones } } });
  });
});
async function captura(page, info, nombre) {
  await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
  await expect(page.locator('#main-content')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath(nombre + '.png'), fullPage: true });
  expect(await page.locator('#main-content').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
}
async function abrir(page) {
  await page.goto('/reportes/nuevo');
  await expect(page.locator('#rep-programa option')).toHaveCount(2);
  await expect(page.locator('#rep-indicadores-opciones input')).toHaveCount(2);
}

test('acceso desde el módulo, catálogos reales del sistema y resultados sin opciones', async ({ page }, info) => {
  const errores = []; page.on('pageerror', (e) => errores.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/reportes');
  await page.locator('#nuevo-reporte').click();
  await expect(page).toHaveURL(/\/reportes\/nuevo$/);
  await expect(page.locator('h1')).toHaveText('Configurar nuevo reporte');
  await abrir(page);
  await expect(page.locator('#rep-pais option')).toHaveText(['Todos los países', 'Chile', 'Perú']);
  await expect(page.locator('#rep-organizacion option')).toHaveText(['Todas las organizaciones', 'Comedor Las Palmas', 'Centro Esperanza']);
  await expect(page.locator('#rep-indicadores-opciones')).toContainText('Raciones entregadas (raciones)');
  await expect(page.locator('#rep-resultados-opciones')).toContainText('No hay resultados disponibles para seleccionar.');
  await expect(page.locator('#rep-seleccion-resumen')).toContainText('Sin filtros');
  await captura(page, info, 'reporte-configuracion');
  await page.locator('a[aria-label="Volver al listado"]').click();
  await expect(page).toHaveURL(/\/reportes$/);
  expect(errores).toEqual([]);
});

test('valida fechas obligatorias y orden, y no continúa con errores', async ({ page }) => {
  await abrir(page);
  await page.evaluate(() => {
    window.eventosSolicitud = 0;
    document.querySelector('#reporte-configuracion').addEventListener('reporte:solicitar', () => { window.eventosSolicitud++; });
  });

  await page.locator('#rep-solicitar').click();
  await expect(page.locator('[data-error-campo][data-campo="fecha_inicio"]')).toHaveText('Ingresa la fecha de inicio.');
  await expect(page.locator('[data-error-campo][data-campo="fecha_termino"]')).toHaveText('Ingresa la fecha de término.');
  await expect(page.locator('#rep-fecha-inicio')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#rep-consulta-listo')).toBeHidden();

  await page.locator('#rep-fecha-inicio').fill('2026-12-31');
  await page.locator('#rep-fecha-termino').fill('2026-01-01');
  await expect(page.locator('[data-error-campo][data-campo="fecha_inicio"]')).toContainText('posterior');
  await expect(page.locator('[data-error-campo][data-campo="fecha_termino"]')).toContainText('anterior');
  await page.locator('#rep-solicitar').click();
  expect(await page.evaluate(() => window.eventosSolicitud)).toBe(0);

  await page.locator('#rep-fecha-inicio').fill('2026-01-01');
  await page.locator('#rep-fecha-termino').fill('2026-12-31');
  await expect(page.locator('[data-error-campo]')).toHaveCount(0);
  await page.locator('#rep-solicitar').click();
  await expect(page.locator('#rep-consulta-listo')).toBeVisible();
  expect(await page.evaluate(() => window.eventosSolicitud)).toBe(1);
});

test('filtros: etiquetas seleccionadas, país acota organizaciones, quitar y restablecer conservan el período', async ({ page }, info) => {
  await abrir(page);
  await page.evaluate(() => document.querySelector('#reporte-configuracion').addEventListener('reporte:solicitar', (e) => { window.detalleSolicitud = e.detail; }));
  await page.locator('#rep-fecha-inicio').fill('2026-01-01');
  await page.locator('#rep-fecha-termino').fill('2026-12-31');
  await page.locator('#rep-pais').selectOption({ label: 'Chile' });
  await expect.poll(() => consultasOrganizaciones.includes(id)).toBe(true);
  await page.locator('#rep-organizacion').selectOption({ label: 'Centro Esperanza' });
  await page.locator('#rep-programa').selectOption({ label: 'Programa Alimentación' });
  await page.locator('#rep-indicadores-opciones label', { hasText: 'Familias atendidas' }).click();
  const etiquetas = page.locator('#rep-seleccion .rep-chip span');
  await expect(etiquetas).toHaveText(['País: Chile', 'Organización: Centro Esperanza', 'Programa: Programa Alimentación', 'Indicador: Familias atendidas']);
  await expect(page.locator('#rep-seleccion-resumen')).toHaveText('4 filtros seleccionados.');
  await captura(page, info, 'reporte-filtros');

  await page.locator('button[aria-label="Quitar filtro Programa: Programa Alimentación"]').click();
  await expect(page.locator('#rep-programa')).toHaveValue('');
  await expect(etiquetas).toHaveCount(3);

  await page.locator('#rep-solicitar').click();
  const detalle = await page.evaluate(() => window.detalleSolicitud);
  expect(detalle).toEqual({
    fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31', destino: 'interno',
    id_pais: id, id_organizacion: organizaciones[1].id_organizacion, indicadores: [catalogo[1].id_indicador],
  });

  await page.locator('#rep-restablecer').click();
  await expect(etiquetas).toHaveCount(0);
  await expect(page.locator('#rep-pais')).toHaveValue('');
  await expect(page.locator('#rep-indicadores-opciones input:checked')).toHaveCount(0);
  await expect(page.locator('#rep-fecha-inicio')).toHaveValue('2026-01-01');
  await expect(page.locator('#rep-fecha-termino')).toHaveValue('2026-12-31');
  await expect(page.locator('#rep-restablecer')).toBeDisabled();
});

test('error al cargar un catálogo: informa, mantiene los demás filtros y permite reintentar', async ({ page, context }) => {
  let falla = true;
  await context.route('**/api/v1/programs', (r) => falla
    ? r.fulfill({ status: 500, json: { ok: false, error: { code: 'ERROR', message: 'Fallo', requestId: 'x' }, data: null } })
    : r.fulfill({ json: { ok: true, data: { programs: programas } } }));
  await page.goto('/reportes/nuevo');
  await expect(page.locator('#rep-catalogos-error')).toBeVisible();
  await expect(page.locator('#rep-catalogos-error-texto')).toContainText('Programas');
  await expect(page.locator('#rep-programa')).toBeDisabled();
  await expect(page.locator('#rep-indicadores-opciones input')).toHaveCount(2);
  falla = false;
  await page.locator('#rep-reintentar').click();
  await expect(page.locator('#rep-catalogos-error')).toBeHidden();
  await expect(page.locator('#rep-programa option')).toHaveCount(2);
  await expect(page.locator('#rep-programa')).toBeEnabled();
});

test('móvil sin desbordes', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  await page.locator('#rep-solicitar').click();
  await captura(page, info, 'reporte-configuracion-movil');
});
