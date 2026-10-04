import { test, expect } from '@playwright/test';
import { stringify, parse } from 'devalue';

async function sesion(context, rol = 'ADMIN') {
  await context.addInitScript(rol => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({
      access_token: rol === 'ADMIN' ? 'qa-admin' : 'qa-coord', refresh_token: 'qa-refresh',
      token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: '17600000-0000-4000-8000-000000000001', email: 'qa@example.test', user_metadata: {} },
    }));
  }, rol);
}
async function completar(page, nombre = 'Programa de prueba de integración') {
  for (const [campo, valor] of Object.entries({ nombre, descripcion: 'Descripción de prueba', objetivo_general: 'Fortalecer equipos', objetivos_especificos: 'Capacitar a las organizaciones' })) {
    await page.locator(`#${campo}`).fill(valor);
  }
  await page.locator('[data-campo="linea_accion"]').first().fill('Formación');
  await page.locator('[data-campo="resultado_esperado"]').first().fill('Equipos capacitados');
}
async function nuevo(page) {
  await page.goto('/programas/nuevo');
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', false);
}
test.beforeEach(async ({ context }) => sesion(context));

test('lista programas de la base, crea, edita, retira líneas y persiste al recargar', async ({ page }) => {
  const fallos = []; page.on('pageerror', error => fallos.push(error.message));
  await page.goto('/programas');
  await expect(page.locator('#programas-listado article')).toHaveCount(6);
  await page.getByRole('link', { name: '+ Nuevo programa', exact: true }).click();
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', false);
  await page.getByRole('button', { name: 'Guardar programa' }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(6);
  await completar(page);
  await page.getByRole('button', { name: 'Agregar línea de acción' }).click();
  await page.locator('[data-campo="linea_accion"]').nth(1).fill('formación');
  await page.locator('[data-campo="resultado_esperado"]').nth(1).fill('Resultado adicional');
  await page.getByRole('button', { name: 'Guardar programa' }).click();
  await expect(page.getByText(/está repetida/)).toBeVisible();
  await page.locator('[data-campo="linea_accion"]').nth(1).fill('Acompañamiento');
  await page.getByRole('button', { name: 'Guardar programa' }).click();
  await expect(page.locator('#programa-confirmacion')).toBeVisible();
  await expect(page.locator('#detalle-lineas dt')).toHaveText(['Formación', 'Acompañamiento']);
  await page.reload();
  await expect(page.locator('#detalle-nombre')).toHaveText('Programa de prueba de integración');
  await page.getByRole('link', { name: 'Editar programa' }).click();
  await expect(page.locator('#nombre')).toHaveValue('Programa de prueba de integración');
  await page.getByRole('button', { name: 'Quitar línea 1', exact: true }).click();
  await page.locator('#nombre').fill('Programa actualizado');
  await page.locator('[data-campo="resultado_esperado"]').fill('Organizaciones fortalecidas');
  await page.getByRole('button', { name: 'Guardar programa' }).click();
  await expect(page.locator('#detalle-lineas dt')).toHaveText(['Acompañamiento']);
  await expect(page.locator('#detalle-lineas dd')).toHaveText(['Organizaciones fortalecidas']);
  await page.reload();
  await expect(page.locator('#detalle-nombre')).toHaveText('Programa actualizado');
  await page.getByRole('link', { name: 'Volver al listado', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Programa actualizado' })).toBeVisible();
  expect(fallos).toEqual([]);
});

test('un programa legado se puede editar sin inventar líneas ni perder sus textos', async ({ page }) => {
  await page.goto('/programas');
  await page.locator('#programas-listado a').filter({ hasText: 'Ver detalle' }).first().click();
  await expect(page.locator('#detalle-legado')).toBeVisible();
  const componentes = await page.locator('#detalle-componentes').textContent();
  const resultados = await page.locator('#detalle-resultados').textContent();
  await page.getByRole('link', { name: 'Editar programa' }).click();
  await expect(page.locator('#programa-legado')).toBeVisible();
  await expect(page.locator('[data-campo="linea_accion"]')).toHaveCount(0);
  await page.locator('#descripcion').fill('Contexto actualizado sin líneas nuevas');
  await page.getByRole('button', { name: 'Guardar programa' }).click();
  await expect(page.locator('#detalle-componentes')).toHaveText(componentes);
  await expect(page.locator('#detalle-resultados')).toHaveText(resultados);
});

test('carga y error de consulta permiten reintentar sin presentar un catálogo vacío', async ({ page }) => {
  let liberar;
  const espera = new Promise(resolve => { liberar = resolve; });
  await page.route('**/_actions/listarProgramas**', async route => {
    await espera;
    await route.fulfill({ body: stringify({ ok: false, codigo: 'ERROR_BASE_DATOS', mensaje: 'Fallo de consulta de prueba', datos: null }) });
  });
  await page.goto('/programas');
  await expect(page.locator('#programas-estado')).toHaveText('Cargando programas…');
  await expect(page.locator('#recargar-programas')).toBeDisabled();
  liberar();
  await expect(page.locator('#programas-error')).toHaveText('Fallo de consulta de prueba');
  await expect(page.locator('#programas-estado')).toBeEmpty();
  await page.unroute('**/_actions/listarProgramas**');
  await page.locator('#recargar-programas').click();
  await expect(page.locator('#programas-listado article').first()).toBeVisible();
});

test('catálogo vacío, UUID inexistente, ID inválido y error de detalle son estados distintos', async ({ page }) => {
  await page.route('**/_actions/listarProgramas**', route => route.fulfill({ body: stringify({ ok: true, datos: [] }) }));
  await page.goto('/programas');
  await expect(page.locator('#programas-estado')).toContainText('No hay programas');
  await expect(page.locator('#programas-error')).toBeHidden();
  await page.goto('/programas/00000000-0000-4000-8000-000000000000');
  await expect(page.locator('#detalle-estado')).toHaveText('Programa no encontrado');
  await expect(page.locator('#programa-recuperacion')).toBeHidden();
  const respuesta = await page.goto('/programas/id-invalido');
  expect(respuesta.status()).toBe(404);
  await expect(page.locator('#detalle-estado')).toHaveText('Programa no encontrado');
  await page.route('**/_actions/obtenerProgramaPorId**', route => route.fulfill({ status: 503, body: 'Error de prueba' }));
  await page.goto('/programas/00000000-0000-4000-8000-000000000000');
  await expect(page.locator('#detalle-estado')).toHaveText('No fue posible cargar el programa');
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
});

test('un guardado lento bloquea dobles envíos y un error conserva los campos', async ({ page }) => {
  await nuevo(page); await completar(page, 'Guardado lento');
  let liberar; let llamadas = 0;
  const espera = new Promise(resolve => { liberar = resolve; });
  await page.route('**/_actions/crearPrograma**', async route => {
    llamadas++; await espera;
    await route.fulfill({ body: stringify({ ok: false, codigo: 'SIN_PERMISO', mensaje: 'Permiso de escritura revocado', datos: null }) });
  });
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-estado')).toHaveText('Guardando programa…');
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#guardar-programa')).toBeDisabled();
  await expect(page.locator('#nombre')).toBeDisabled();
  await page.locator('#programa-form').dispatchEvent('submit');
  expect(llamadas).toBe(1); liberar();
  await expect(page.locator('#programa-errores')).toHaveText('Permiso de escritura revocado');
  await expect(page.locator('#nombre')).toHaveValue('Guardado lento');
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', false);
  await page.unroute('**/_actions/crearPrograma**');
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#detalle-nombre')).toHaveText('Guardado lento');
});

test('conflicto entre pestañas conserva cambios y permite recargar la versión vigente', async ({ page, context }) => {
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

test('coordinador consulta y el backend rechaza creación y edición aunque se fuerce la Action', async ({ page, context }) => {
  await sesion(context, 'COORD');
  await page.goto('/programas');
  await expect(page.locator('#programas-listado article').first()).toBeVisible();
  await expect(page.locator('#crear-programa-panel')).toBeHidden();
  await page.locator('#programas-listado a').first().click();
  await expect(page.locator('#detalle-contenido')).toBeVisible();
  await expect(page.locator('#editar-programa-enlace')).toBeHidden();
  await page.goto('/programas/nuevo');
  await expect(page.locator('#unauthorized-message')).toBeVisible();
  const respuesta = await page.request.post('/_actions/crearPrograma', {
    headers: { Authorization: 'Bearer qa-coord' },
    data: { nombre: 'Intento', descripcion: 'Descripción', objetivo_general: 'Objetivo', objetivos_especificos: 'Objetivos', lineas_accion: [{ linea_accion: 'Línea', resultado_esperado: 'Resultado' }] },
  });
  expect(await respuesta.text()).toContain('SIN_PERMISO');
});

test('validación del servidor identifica cada campo y el formulario funciona en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await nuevo(page); await completar(page);
  await page.route('**/_actions/crearPrograma**', route => route.fulfill({
    status: 400, json: { issues: [{ path: ['lineas_accion', 0, 'resultado_esperado'], message: 'Resultado rechazado por el servidor' }] },
  }));
  await page.locator('#guardar-programa').click();
  await expect(page.locator('[data-campo="resultado_esperado"]')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Resultado rechazado por el servidor')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: test.info().outputPath('formulario-movil.png'), fullPage: true });
});

test('la sesión expirada conserva el borrador y no envía una creación anónima', async ({ page }) => {
  await nuevo(page); await completar(page, 'Borrador con sesión expirada');
  await page.evaluate(() => localStorage.removeItem('sb-127-auth-token'));
  let llamadas = 0;
  page.on('request', request => { if (request.url().includes('/_actions/crearPrograma')) llamadas++; });
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-errores')).toContainText('sesión expiró');
  await expect(page.locator('#nombre')).toHaveValue('Borrador con sesión expirada');
  expect(llamadas).toBe(0);
});

test('detalle y edición muestran carga y no habilitan campos antes de consultar', async ({ page }) => {
  await page.goto('/programas');
  const enlace = page.locator('#programas-listado a').first();
  await expect(enlace).toBeVisible();
  const ruta = await enlace.getAttribute('href');
  let liberar;
  let espera = new Promise(resolve => { liberar = resolve; });
  await page.route('**/_actions/obtenerProgramaPorId**', async route => { await espera; await route.continue(); });
  await page.goto(ruta);
  await expect(page.locator('#detalle-estado')).toHaveText('Cargando programa…');
  await expect(page.locator('#programa-detalle')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#detalle-contenido')).toBeHidden();
  liberar();
  await expect(page.locator('#detalle-contenido')).toBeVisible();
  espera = new Promise(resolve => { liberar = resolve; });
  await page.goto(`${ruta}/editar`);
  await expect(page.locator('#programa-estado')).toHaveText('Cargando formulario…');
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', true);
  await expect(page.locator('#nombre')).toBeDisabled();
  liberar();
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', false);
});

test('edición de un programa inexistente o ID inválido mantiene el formulario deshabilitado', async ({ page }) => {
  for (const id of ['00000000-0000-4000-8000-000000000000', 'id-invalido']) {
    const respuesta = await page.goto(`/programas/${id}/editar`);
    if (id === 'id-invalido') expect(respuesta.status()).toBe(404);
    await expect(page.locator('#programa-estado')).toHaveText('Programa no encontrado');
    await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', true);
    await expect(page.locator('#guardar-programa')).toBeDisabled();
    await expect(page.locator('#programa-recuperacion')).toBeHidden();
  }
});

test('las Actions reales validan entradas y rechazan una edición forzada de COORD', async ({ page }) => {
  const crear = await page.request.post('/_actions/crearPrograma', {
    headers: { Authorization: 'Bearer qa-admin' }, data: { nombre: '', lineas_accion: [] },
  });
  expect(crear.status()).toBe(400);
  const validacion = await crear.json();
  expect(validacion.issues.some(issue => issue.path[0] === 'nombre')).toBe(true);
  await page.goto('/programas');
  const enlace = page.locator('#programas-listado a').first();
  await expect(enlace).toBeVisible();
  const id = (await enlace.getAttribute('href')).split('/')[2];
  const editar = await page.request.post('/_actions/actualizarPrograma', {
    headers: { Authorization: 'Bearer qa-coord' },
    data: { id_programa: id, version_esperada: 1, cambios: { nombre: 'Intento no autorizado' } },
  });
  expect(parse(await editar.text())).toMatchObject({ ok: false, codigo: 'SIN_PERMISO' });
});

test('un error de detalle permite reintentar y una recarga inexistente oculta el contenido anterior', async ({ page }) => {
  await page.goto('/programas');
  const enlace = page.locator('#programas-listado a').first();
  await expect(enlace).toBeVisible();
  const ruta = await enlace.getAttribute('href');
  await page.route('**/_actions/obtenerProgramaPorId**', route => route.fulfill({ status: 503, body: 'Fallo temporal' }));
  await page.goto(ruta);
  await expect(page.locator('#detalle-error')).toBeVisible();
  await page.unroute('**/_actions/obtenerProgramaPorId**');
  await page.locator('#recargar-programa').click();
  await expect(page.locator('#detalle-contenido')).toBeVisible();
  await page.route('**/_actions/obtenerProgramaPorId**', route => route.fulfill({
    body: stringify({ ok: false, codigo: 'NO_ENCONTRADO', mensaje: 'El programa solicitado no existe.', datos: null }),
  }));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.locator('#detalle-estado')).toHaveText('Programa no encontrado');
  await expect(page.locator('#detalle-contenido')).toBeHidden();
  await expect(page.locator('#editar-programa-enlace')).toBeHidden();
});
