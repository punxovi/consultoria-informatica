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
  await context.route('**/api/v1/actions', (r) => r.fulfill({ json: { ok: true, data: { actions: [] } } }));
  await context.route('**/api/v1/organizations**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith('/countries')) return r.fulfill({ json: { ok: true, data: { countries: paises } } });
    consultasOrganizaciones.push(url.searchParams.get('id_pais'));
    return r.fulfill({ json: { ok: true, data: { organizations: url.searchParams.get('id_pais') === idOtro ? [] : organizaciones } } });
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
  await page.evaluate(() => document.querySelector('#reporte-configuracion').addEventListener('reporte:solicitar', (e) => { window.detalleSolicitud = e.detail.parametros; }));
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
  await expect(page.locator('#rep-consulta-listo')).toBeHidden();
  await expect(etiquetas).toHaveCount(0);
  await expect(page.locator('#rep-pais')).toHaveValue('');
  await expect(page.locator('#rep-indicadores-opciones input:checked')).toHaveCount(0);
  await expect(page.locator('#rep-fecha-inicio')).toHaveValue('2026-01-01');
  await expect(page.locator('#rep-fecha-termino')).toHaveValue('2026-12-31');
  await expect(page.locator('#rep-restablecer')).toBeDisabled();
});

test('quitar el país recarga organizaciones y editar el período invalida la solicitud', async ({ page }) => {
  await abrir(page);
  await page.locator('#rep-pais').selectOption(idOtro);
  await expect(page.locator('#rep-organizacion option')).toHaveCount(1);
  await page.getByRole('button', { name: 'Quitar filtro País: Perú', exact: true }).click();
  await expect(page.locator('#rep-organizacion option')).toHaveCount(3);
  await page.locator('#rep-fecha-inicio').fill('2026-01-01');
  await page.locator('#rep-fecha-termino').fill('2026-12-31');
  await page.locator('#rep-solicitar').click();
  await expect(page.locator('#rep-consulta-listo')).toBeVisible();
  await page.locator('#rep-fecha-inicio').fill('2026-06-01');
  await expect(page.locator('#rep-consulta-listo')).toBeHidden();
  await page.locator('#rep-solicitar').click();
  await expect(page.locator('#rep-parametros')).toContainText('01/06/2026');
});

test('resultados reales: carga, error recuperable y parámetros de selección', async ({ page, context }) => {
  const accion = '13700000-0000-4000-8000-0000000000d1';
  const indicador = '13700000-0000-4000-8000-0000000000e1';
  const resultado = '13700000-0000-4000-8000-0000000000f1';
  let falla = true;
  await context.route('**/api/v1/actions', r => r.fulfill({ json: { ok: true, data: { actions: [{id_accion:accion,nombre:'Entrega de alimentos'}] } } }));
  await context.route(`**/api/v1/actions/${accion}/indicators`, r => falla
    ? r.fulfill({status:500,json:{ok:false,error:{code:'ERROR',message:'Error temporal'}}})
    : r.fulfill({json:{ok:true,data:{indicadores:[{id_indicador:indicador,id_accion:accion,id_catalogo:catalogo[0].id_indicador,meta:100,version:1,nombre:'Raciones',unidad_medida:'raciones',resultado:{id_resultado:resultado,id_indicador:indicador,valor_medido:80,fecha_medicion:'2026-06-01',observaciones:null,version:1}}]}}}));
  await abrir(page);
  await expect(page.locator('#rep-catalogos-error')).toContainText('Resultados');
  falla = false;
  await page.locator('#rep-reintentar').click();
  await expect(page.locator('#rep-resultados-opciones')).toContainText('Entrega de alimentos · Raciones: 80 raciones');
  await page.locator('#rep-resultados-opciones input').check();
  await expect(page.locator('#rep-seleccion')).toContainText('Resultado: Entrega de alimentos');
  await page.evaluate(() => document.querySelector('#reporte-configuracion').addEventListener('reporte:solicitar', e => {window.detalleSolicitud=e.detail.parametros;}));
  await page.locator('#rep-fecha-inicio').fill('2026-01-01');
  await page.locator('#rep-fecha-termino').fill('2026-12-31');
  await page.locator('#rep-solicitar').click();
  expect((await page.evaluate(()=>window.detalleSolicitud)).resultados).toEqual([resultado]);
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

// --- Estados de la consulta con RESPUESTAS SIMULADAS -------------------------
// No se llama al Backend: un listener de prueba ocupa el lugar de la integración HTTP
// posterior y responde a `reporte:solicitar` con promesas controladas desde la prueba.
const vistaConDatos = {
  destination: 'interno', title: 'Reporte Consolidado Institucional',
  document: { title: 'Reporte consolidado de intervenciones', destination: 'interno', generatedAt: '2026-10-24T12:00:00.000Z',
    period: { start: '2026-01-01', end: '2026-12-31' }, filters: [], summary: [{ label: 'Beneficiarios', value: '120' }, { label: 'Acciones cumplidas', value: '4' }],
    sections: [{ key: 'organizations', title: 'Organizaciones', columns: ['Organización', 'País', 'Beneficiarios'], rows: [['Comedor Las Palmas', 'Chile', '120']] },
      { key: 'plans', title: 'Planes', columns: ['Plan'], rows: [] }] },
  download: { id: 'x', url: '/api/v1/reports/x/pdf', fileName: 'reporte.pdf', mimeType: 'application/pdf', expiresAt: '2026-10-24T12:05:00.000Z' },
};
const vistaVacia = { ...vistaConDatos, document: { ...vistaConDatos.document, sections: [{ key: 'organizations', title: 'Organizaciones', columns: ['Organización'], rows: [] }] } };

async function simularIntegracion(page) {
  await page.evaluate(() => {
    window.solicitudesSimuladas = [];
    document.querySelector('#reporte-configuracion').addEventListener('reporte:solicitar', (e) => {
      const pendiente = {};
      e.detail.responder(new Promise((resolver, rechazar) => { pendiente.resolver = resolver; pendiente.rechazar = rechazar; }));
      window.solicitudesSimuladas.push({ parametros: e.detail.parametros, ...pendiente });
    });
  });
}
const responderSimulado = (page, indice, vista) => page.evaluate(([i, v]) => window.solicitudesSimuladas[i].resolver(v), [indice, vista]);
const fallarSimulado = (page, indice) => page.evaluate((i) => window.solicitudesSimuladas[i].rechazar(new Error('fallo simulado')), indice);
async function completarPeriodo(page) {
  await page.locator('#rep-fecha-inicio').fill('2026-01-01');
  await page.locator('#rep-fecha-termino').fill('2026-12-31');
}

test('(respuesta simulada) carga y éxito: bloquea la solicitud y muestra el resumen de la vista previa', async ({ page }, info) => {
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  await expect(page.locator('#rep-consulta-carga')).toBeVisible();
  await expect(page.locator('#rep-consulta')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#rep-solicitar')).toBeDisabled();
  await expect(page.locator('#rep-parametros')).toContainText('01/01/2026 al 31/12/2026');
  await responderSimulado(page, 0, vistaConDatos);
  await expect(page.locator('#rep-consulta-exito')).toBeVisible();
  await expect(page.locator('#rep-consulta-carga')).toBeHidden();
  await expect(page.locator('#rep-solicitar')).toBeEnabled();
  await expect(page.locator('#rep-vista-meta')).toContainText('Reporte consolidado de intervenciones');
  await expect(page.locator('#rep-vista-resumen .rep-param')).toHaveText(['Beneficiarios120', 'Acciones cumplidas4', 'Secciones con datos1 de 2']);
  await page.setViewportSize({ width: 390, height: 844 });
  await captura(page, info, 'reporte-consulta-exito-movil');
});

test('(respuesta simulada) ausencia de resultados', async ({ page }) => {
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  await responderSimulado(page, 0, vistaVacia);
  await expect(page.locator('#rep-consulta-vacio')).toBeVisible();
  await expect(page.locator('#rep-consulta-vacio')).toContainText('No hay resultados para los criterios seleccionados.');
  await expect(page.locator('#rep-consulta-exito')).toBeHidden();
});

test('(respuesta simulada) error y reintento con los mismos criterios', async ({ page }, info) => {
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-pais').selectOption({ label: 'Chile' });
  await page.locator('#rep-solicitar').click();
  await fallarSimulado(page, 0);
  await expect(page.locator('#rep-consulta-error')).toBeVisible();
  await expect(page.locator('#rep-consulta-error-texto')).toHaveText('No fue posible preparar la vista previa. Inténtalo nuevamente.');
  await expect(page.locator('#rep-solicitar')).toBeEnabled();
  await captura(page, info, 'reporte-consulta-error');
  await page.locator('#rep-consulta-reintentar').click();
  await expect(page.locator('#rep-consulta-carga')).toBeVisible();
  const solicitudes = await page.evaluate(() => window.solicitudesSimuladas.map((s) => s.parametros));
  expect(solicitudes).toHaveLength(2);
  expect(solicitudes[1]).toEqual(solicitudes[0]);
  expect(solicitudes[1].id_pais).toBe(id);
  await responderSimulado(page, 1, vistaConDatos);
  await expect(page.locator('#rep-consulta-exito')).toBeVisible();
  await expect(page.locator('#rep-consulta-error')).toBeHidden();
});

test('(respuesta simulada) cambiar criterios durante la carga descarta la respuesta anterior', async ({ page }) => {
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  await expect(page.locator('#rep-consulta-carga')).toBeVisible();
  await page.locator('#rep-indicadores-opciones label', { hasText: 'Raciones entregadas' }).click();
  await expect(page.locator('#rep-consulta-inactivo')).toBeVisible();
  await expect(page.locator('#rep-solicitar')).toBeEnabled();
  await responderSimulado(page, 0, vistaConDatos);
  await expect(page.locator('#rep-consulta-exito')).toBeHidden();
  await expect(page.locator('#rep-consulta-inactivo')).toBeVisible();
  await page.locator('#rep-solicitar').click();
  const segunda = await page.evaluate(() => window.solicitudesSimuladas[1].parametros);
  expect(segunda.indicadores).toEqual([catalogo[0].id_indicador]);
  await responderSimulado(page, 1, vistaVacia);
  await expect(page.locator('#rep-consulta-vacio')).toBeVisible();
});

test('sin integración conectada la solicitud queda preparada y no simula una consulta', async ({ page }) => {
  await abrir(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  await expect(page.locator('#rep-consulta-listo')).toBeVisible();
  for (const estado of ['carga', 'error', 'vacio', 'exito']) await expect(page.locator(`#rep-consulta-${estado}`)).toBeHidden();
});
