import { test, expect } from '@playwright/test';
import { consolidadoConDatos, resumenConDatos, respuestaSimulada } from '../helpers/reporte-contrato.mjs';
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
const accionDemo = '13700000-0000-4000-8000-0000000000d0';
const indicadoresAsociados = catalogo.map((indicador, index) => ({
  id_indicador: `13700000-0000-4000-8000-0000000000e${index + 1}`,
  id_accion: accionDemo,
  id_catalogo: indicador.id_indicador,
  meta: 10,
  version: 1,
  nombre: indicador.nombre,
  unidad_medida: indicador.unidad_medida,
  resultado: null,
}));
let consultasOrganizaciones;
test.beforeEach(async ({ context }) => {
  consultasOrganizaciones = [];
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'qa-admin', refresh_token: 'qa-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '13700000-0000-4000-8000-000000000001', email: 'qa@example.test', user_metadata: {} } })));
  await context.addCookies([{ name: 'fge_access_token', value: 'qa-admin', url: 'http://127.0.0.1:4331' }]);
  await context.route('http://127.0.0.1:54329/**', (r) => r.fulfill({ json: [{ codigo: 'COORD', alcance: 'global', id_pais: null }] }));
  await context.route('**/rest/v1/rpc/get_user_roles', (r) => r.fulfill({ json: [{ codigo: 'COORD', alcance: 'global', id_pais: null }] }));
  await context.route('**/auth/v1/user', (r) => r.fulfill({ json: { id, email: 'qa@example.test' } }));
  await context.route('**/api/v1/auth/session', (r) => r.fulfill({ json: { ok: true, data: { authenticated: true, user: { id } } } }));
  await context.route('**/api/v1/programs', (r) => r.fulfill({ json: { ok: true, data: { programs: programas } } }));
  await context.route('**/api/v1/indicators/catalog', (r) => r.fulfill({ json: { ok: true, data: { catalogo } } }));
  await context.route('**/api/v1/actions', (r) => r.fulfill({ json: { ok: true, data: { actions: [{ id_accion: accionDemo, nombre: 'Acción de prueba' }] } } }));
  await context.route(`**/api/v1/actions/${accionDemo}/indicators`, (r) => r.fulfill({ json: { ok: true, data: { indicadores: indicadoresAsociados } } }));
  await context.route('**/api/v1/reports/consolidated**', (r) => {
    const query = new URL(r.request().url()).searchParams;
    const parametros = {
      fecha_inicio: query.get('fecha_inicio'), fecha_termino: query.get('fecha_termino'),
      destino: query.get('destino') ?? 'interno',
      ...(query.get('id_pais') ? { id_pais: query.get('id_pais') } : {}),
      ...(query.get('id_organizacion') ? { id_organizacion: query.get('id_organizacion') } : {}),
      ...(query.get('id_programa') ? { id_programa: query.get('id_programa') } : {}),
      ...(query.get('indicadores') ? { indicadores: query.get('indicadores').split(',') } : {}),
      ...(query.get('resultados') ? { resultados: query.get('resultados').split(',') } : {}),
    };
    return r.fulfill({ json: { ok: true, data: { report: respuestaSimulada(parametros) } } });
  });
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
  await expect(page.locator('#rep-indicadores-opciones')).toContainText('Acción de prueba · Raciones entregadas (raciones)');
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
  await expect(page.locator('#rep-consulta-vacio')).toBeVisible();
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
    id_pais: id, id_organizacion: organizaciones[1].id_organizacion, indicadores: [indicadoresAsociados[1].id_indicador],
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
  await expect(page.locator('#rep-consulta-vacio')).toBeVisible();
  // La vista previa ocupa su propia pantalla: se vuelve a los filtros para editarlos.
  await page.locator('#rep-volver-configurar').click();
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

// --- Estados de la consulta y vista previa con RESPUESTAS SIMULADAS ----------
// No se llama al Backend: un listener de prueba ocupa el lugar de la integración HTTP
// posterior y responde a `reporte:solicitar`. Los documentos se generan con la función
// real del Backend (tests/helpers/reporte-contrato.mjs) a partir de los parámetros recibidos.
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
const parametrosSimulados = (page, indice) => page.evaluate((i) => window.solicitudesSimuladas[i].parametros, indice);
async function responderSimulado(page, indice, secciones = {}, resumen = {}, ajustar = (p) => p) {
  const vista = respuestaSimulada(ajustar(await parametrosSimulados(page, indice)), secciones, resumen);
  await page.evaluate(([i, v]) => window.solicitudesSimuladas[i].resolver(v), [indice, vista]);
}
const fallarSimulado = (page, indice) => page.evaluate((i) => window.solicitudesSimuladas[i].rechazar(new Error('fallo simulado')), indice);
async function completarPeriodo(page) {
  await page.locator('#rep-fecha-inicio').fill('2026-01-01');
  await page.locator('#rep-fecha-termino').fill('2026-12-31');
}
const titulosHU22 = ['Organizaciones y beneficiarios', 'Planes de Intervención', 'Acciones', 'Acciones ejecutadas', 'Compromisos cumplidos', 'Donaciones y recursos', 'Indicadores', 'Resultados obtenidos'];

test('(respuesta simulada) carga y éxito: bloquea la solicitud y muestra la vista previa', async ({ page }) => {
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  await expect(page.locator('#rep-consulta-carga')).toBeVisible();
  await expect(page.locator('#rep-consulta')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#rep-solicitar')).toBeDisabled();
  await expect(page.locator('#rep-vista-previa')).toBeHidden();
  await expect(page.locator('#rep-parametros')).toContainText('01/01/2026 al 31/12/2026');
  await responderSimulado(page, 0, consolidadoConDatos, resumenConDatos);
  await expect(page.locator('#rep-consulta-exito')).toBeVisible();
  await expect(page.locator('#rep-consulta-carga')).toBeHidden();
  await expect(page.locator('#rep-solicitar')).toBeEnabled();
  await expect(page.locator('#rep-vista-previa')).toBeVisible();
});

test('(respuesta simulada) vista previa: período, criterios, secciones de HU22 y valores tal como llegan', async ({ page }, info) => {
  const errores = []; page.on('pageerror', (e) => errores.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1050 });
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-pais').selectOption({ label: 'Chile' });
  await page.locator('#rep-indicadores-opciones label', { hasText: 'Familias atendidas' }).click();
  await page.locator('#rep-solicitar').click();
  const parametros = await parametrosSimulados(page, 0);
  const datos = {
    ...consolidadoConDatos,
    organizations: [...consolidadoConDatos.organizations, { nombre: '<img src=x onerror="window.inyectado=1">', pais: 'Chile', numero_beneficiarios: 0 }],
    results: [],
  };
  await responderSimulado(page, 0, datos, resumenConDatos);
  const vista = page.locator('#rep-vista-previa');
  await expect(vista).toBeVisible();

  // Período y criterios aplicados, con los nombres elegidos por el usuario.
  await expect(vista.locator('[data-vp-periodo] dd')).toHaveText('01/01/2026 al 31/12/2026');
  await expect(vista.locator('[data-vp-criterio]')).toHaveText(['PaísChile', 'IndicadorFamilias atendidas']);
  await expect(vista.locator('header')).toContainText('Uso interno');

  // Las 8 secciones diferenciadas, en el orden del contrato, con su cantidad de registros.
  const secciones = vista.locator('.rep-vp-seccion');
  await expect(secciones.locator('h4')).toHaveText(titulosHU22);
  await expect(vista.locator('.rep-vp-indice-enlace')).toHaveCount(8);
  await expect(vista.locator('#rep-seccion-organizations .rep-vp-contador')).toHaveText('3 registros');
  await expect(vista.locator('#rep-seccion-completedActions tbody tr')).toHaveCount(1);
  await expect(vista.locator('#rep-seccion-completedActions')).toContainText('Entrega de canastas');
  await expect(vista.locator('#rep-seccion-commitments tbody tr')).toHaveCount(1);
  await expect(vista.locator('#rep-seccion-commitments')).not.toContainText('Gestionar refrigerador');

  // Valores sin recalcular ni formatear, y celdas de varias líneas legibles.
  await expect(vista.locator('.rep-vp-resumen dd')).toHaveText(['155', '1', '150000.5']);
  await expect(vista.locator('#rep-seccion-donations td').nth(3)).toHaveText('150000.5');
  await expect(vista.locator('#rep-seccion-donations td').nth(4)).toHaveText('No informado');
  await expect(vista.locator('#rep-seccion-donations')).toContainText('no informa moneda');
  await expect(vista.locator('#rep-seccion-plans td').nth(1)).toHaveText('Comedor Las Palmas\nPrograma Alimentación', { useInnerText: true });

  // Sección vacía con mensaje comprensible.
  await expect(vista.locator('#rep-seccion-results .rep-vp-vacio')).toHaveText('Esta sección no tiene registros para el período y los filtros seleccionados.');
  await expect(vista.locator('#rep-seccion-results table')).toHaveCount(0);

  // Los textos recibidos se muestran como texto, nunca como HTML.
  await expect(vista.locator('#rep-seccion-organizations')).toContainText('<img src=x');
  expect(await page.evaluate(() => window.inyectado)).toBeUndefined();

  // Navegación por el índice y secciones plegables.
  await vista.locator('.rep-vp-indice-enlace', { hasText: 'Donaciones y recursos' }).click();
  await expect(page).toHaveURL(/#rep-seccion-donations$/);
  await expect(vista.locator('#rep-seccion-donations')).toBeInViewport();
  const plegar = vista.locator('#rep-seccion-actions .rep-vp-plegar');
  await plegar.click();
  await expect(vista.locator('#rep-seccion-actions-cuerpo')).toBeHidden();
  await expect(plegar).toHaveAttribute('aria-expanded', 'false');
  await plegar.click();
  await expect(vista.locator('#rep-seccion-actions-cuerpo')).toBeVisible();

  expect(parametros.id_pais).toBe(id);
  await captura(page, info, 'vista-previa-escritorio');
  expect(errores).toEqual([]);
});

test('(respuesta simulada) vista previa en móvil: filas como tarjetas legibles y sin desbordes', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  await responderSimulado(page, 0, consolidadoConDatos, resumenConDatos);
  const fila = page.locator('#rep-seccion-plans tbody tr').first();
  await expect(fila).toBeVisible();
  await expect(page.locator('#rep-seccion-plans thead')).toHaveCSS('position', 'absolute');
  // Cada celda muestra su columna como etiqueta y no se superpone con la siguiente.
  const celdas = await fila.locator('td').evaluateAll((tds) => tds.map((td) => {
    const r = td.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, right: r.right, etiqueta: getComputedStyle(td, '::before').content };
  }));
  expect(celdas.map((c) => c.etiqueta)).toEqual(['"Plan"', '"Organización / Programa"', '"Inicio"', '"Término"']);
  for (let i = 1; i < celdas.length; i++) expect(celdas[i].top).toBeGreaterThanOrEqual(celdas[i - 1].bottom - 1);
  expect(Math.max(...celdas.map((c) => c.right))).toBeLessThanOrEqual(390);
  await captura(page, info, 'vista-previa-movil');
  for (const seccion of ['plans', 'donations']) {
    await page.locator(`#rep-seccion-${seccion}`).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`vista-previa-movil-${seccion}.png`) });
  }
});

test('(respuesta simulada) secciones extensas se muestran por tramos', async ({ page }) => {
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  const acciones = Array.from({ length: 60 }, (_, i) => ({ nombre: `Acción ${i + 1}`, estado: 'en_proceso', fecha_inicio: '2026-01-01', fecha_termino: '2026-02-01', plan: 'Plan' }));
  await responderSimulado(page, 0, { ...consolidadoConDatos, actions: acciones }, resumenConDatos);
  const seccion = page.locator('#rep-seccion-actions');
  await expect(seccion.locator('.rep-vp-contador')).toHaveText('60 registros');
  await expect(seccion.locator('tbody tr')).toHaveCount(25);
  const mas = seccion.locator('.rep-vp-mas');
  await expect(mas).toHaveText('Mostrar 25 más (quedan 35)');
  await mas.click();
  await expect(seccion.locator('tbody tr')).toHaveCount(50);
  await expect(mas).toHaveText('Mostrar 10 más (quedan 10)');
  await mas.click();
  await expect(seccion.locator('tbody tr')).toHaveCount(60);
  await expect(seccion.locator('tbody tr').last()).toContainText('Acción 60');
  await expect(mas).toBeHidden();
});

test('(respuesta simulada) ausencia de resultados: aviso general y secciones vacías comprensibles', async ({ page }) => {
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  await responderSimulado(page, 0);
  await expect(page.locator('#rep-consulta-vacio')).toBeVisible();
  await expect(page.locator('#rep-consulta-vacio')).toContainText('No hay resultados para los criterios seleccionados.');
  await expect(page.locator('#rep-consulta-exito')).toBeHidden();
  await expect(page.locator('#rep-vista-previa .rep-vp-seccion')).toHaveCount(8);
  await expect(page.locator('#rep-vista-previa .rep-vp-vacio')).toHaveCount(8);
  await expect(page.locator('#rep-vista-previa table')).toHaveCount(0);
});

test('(respuesta simulada) destino externo: solo agregados y aviso de información agregada', async ({ page }) => {
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-destino').selectOption('donante');
  await page.locator('#rep-solicitar').click();
  await responderSimulado(page, 0, consolidadoConDatos, resumenConDatos);
  const vista = page.locator('#rep-vista-previa');
  await expect(vista.locator('header')).toContainText('Donantes');
  await expect(vista.locator('header')).toContainText('solo información agregada');
  await expect(vista.locator('#rep-seccion-organizations th')).toHaveText(['Medida', 'Valor']);
  await expect(vista.locator('#rep-seccion-organizations tbody tr')).toHaveText(['Organizaciones2', 'Beneficiarios155']);
  await expect(vista).not.toContainText('Comedor Las Palmas');
});

test('(respuesta simulada) una respuesta que no corresponde al período no se muestra como reporte', async ({ page }) => {
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  await responderSimulado(page, 0, consolidadoConDatos, resumenConDatos, (p) => ({ ...p, fecha_termino: '2026-06-30' }));
  await expect(page.locator('#rep-consulta-error')).toBeVisible();
  await expect(page.locator('#rep-consulta-error-texto')).toContainText('no corresponde a los criterios solicitados');
  await expect(page.locator('#rep-vista-previa')).toBeHidden();
  await expect(page.locator('#rep-vista-previa .rep-vp-seccion')).toHaveCount(0);
  await expect(page.locator('#rep-consulta-reintentar')).toBeVisible();
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
  await responderSimulado(page, 1, consolidadoConDatos, resumenConDatos);
  await expect(page.locator('#rep-consulta-exito')).toBeVisible();
  await expect(page.locator('#rep-consulta-error')).toBeHidden();
  await expect(page.locator('#rep-vista-previa .rep-vp-seccion')).toHaveCount(8);
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
  await responderSimulado(page, 0, consolidadoConDatos, resumenConDatos);
  await expect(page.locator('#rep-consulta-exito')).toBeHidden();
  await expect(page.locator('#rep-vista-previa')).toBeHidden();
  await expect(page.locator('#rep-consulta-inactivo')).toBeVisible();
  await page.locator('#rep-solicitar').click();
  const segunda = await parametrosSimulados(page, 1);
  expect(segunda.indicadores).toEqual([catalogo[0].id_indicador]);
  await responderSimulado(page, 1);
  await expect(page.locator('#rep-consulta-vacio')).toBeVisible();
});

test('(respuesta simulada) modificar criterios con la vista previa abierta la retira hasta volver a solicitarla', async ({ page }) => {
  await abrir(page);
  await simularIntegracion(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  await responderSimulado(page, 0, consolidadoConDatos, resumenConDatos);
  await expect(page.locator('#rep-vista-previa .rep-vp-seccion')).toHaveCount(8);
  // Paso 2 en su propia pantalla; «Modificar filtros» vuelve al formulario con los valores intactos.
  await expect(page.locator('#rep-paso-configurar')).toBeHidden();
  await expect(page).toHaveURL(/#vista-previa$/);
  await page.locator('#rep-volver-configurar').click();
  await expect(page.locator('#rep-form')).toBeVisible();
  await expect(page.locator('#rep-fecha-inicio')).toHaveValue('2026-01-01');
  await expect(page.locator('#rep-ver-vista')).toBeVisible();
  await page.locator('#rep-ver-vista').click();await expect(page.locator('#rep-vista-previa')).toBeVisible();
  await page.goBack();await expect(page.locator('#rep-form')).toBeVisible();
  await page.locator('#rep-fecha-termino').fill('2026-06-30');
  await expect(page.locator('#rep-vista-previa')).toBeHidden();
  await expect(page.locator('#rep-vista-previa .rep-vp-seccion')).toHaveCount(0);
  await page.locator('#rep-solicitar').click();
  await responderSimulado(page, 1, consolidadoConDatos, resumenConDatos);
  await expect(page.locator('#rep-vista-previa [data-vp-periodo] dd')).toHaveText('01/01/2026 al 30/06/2026');
});

test('integración HTTP: la vista previa usa el Gateway y el PDF descarga exactamente su referencia preparada', async ({ page, context }) => {
  const consultas = [];
  let descargas = 0;
  await context.route('**/api/v1/reports/consolidated**', (r) => {
    const query = new URL(r.request().url()).searchParams;
    consultas.push(Object.fromEntries(query));
    return r.fulfill({ json: { ok: true, data: { report: respuestaSimulada({
      fecha_inicio: query.get('fecha_inicio'), fecha_termino: query.get('fecha_termino'), destino: query.get('destino'),
      ...(query.get('id_pais') ? { id_pais: query.get('id_pais') } : {}),
    }, consolidadoConDatos, resumenConDatos) } } });
  });
  await context.route('**/api/v1/reports/13800000-0000-4000-8000-000000000001/pdf', (r) => {
    descargas++;
    return r.fulfill({ contentType: 'application/pdf', body: Buffer.from('%PDF-1.3\nReporte QA\n%%EOF') });
  });
  await abrir(page);
  await completarPeriodo(page);
  await page.locator('#rep-pais').selectOption(id);
  await page.locator('#rep-solicitar').click();
  await expect(page.locator('#rep-consulta-exito')).toBeVisible();
  await expect(page.locator('#rep-vista-previa')).toBeVisible();
  await expect(page.locator('#rep-exportacion')).toBeVisible();
  expect(consultas).toEqual([{ fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31', destino: 'interno', id_pais: id }]);

  await page.locator('#rep-exportar-pdf').click();
  await expect(page.locator('#rep-exportacion-confirmacion')).toBeVisible();
  const descarga = page.waitForEvent('download');
  await page.locator('#rep-confirmar-pdf').click();
  expect((await descarga).suggestedFilename()).toBe('reporte-fge-2026-01-01_2026-12-31-interno.pdf');
  await expect(page.locator('#rep-exportacion-exito')).toContainText('PDF descargado');
  expect(descargas).toBe(1);
  expect(consultas).toHaveLength(1);
  // Tras descargar se vuelve a Reportes con la confirmación, sin quedarse en la vista previa.
  await expect(page).toHaveURL(/\/reportes$/);
  await expect(page.locator('#reportes-descargado')).toContainText('reporte-fge-2026-01-01_2026-12-31-interno.pdf');
});

test('integración HTTP: un error del PDF se informa sin mostrar una descarga exitosa', async ({ page, context }) => {
  await context.route('**/api/v1/reports/13800000-0000-4000-8000-000000000001/pdf', (r) =>
    r.fulfill({ status: 500, json: { ok: false, error: { code: 'PDF_GENERACION_FALLIDA', message: 'No se pudo generar', requestId: 'qa' } } }),
  );
  await abrir(page);
  await completarPeriodo(page);
  await page.locator('#rep-solicitar').click();
  await expect(page.locator('#rep-exportacion')).toBeVisible();
  await page.locator('#rep-exportar-pdf').click();
  await page.locator('#rep-confirmar-pdf').click();
  await expect(page.locator('#rep-exportacion-error')).toContainText('No fue posible generar el PDF');
  await expect(page.locator('#rep-exportacion-exito')).toBeHidden();
});
