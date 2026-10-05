import { test, expect } from '@playwright/test';

// Pruebas de interfaz con servicios HTTP simulados; no escriben en la base remota.
const idPlan = '17600000-0000-4000-8000-000000000001';
const idAccion = '17600000-0000-4000-8000-000000000002';
const rutaPlan = `/planes/${idPlan}`;
const rutaAccion = `${rutaPlan}/acciones/${idAccion}`;
const plan = {
  id_plan: idPlan, nombre: 'Plan comunitario', version: 2, periodo_anual: 2026,
  organizacion: { nombre: 'Organización de prueba' }, programa: { nombre: 'Programa de prueba' },
  fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31', responsable_nombre: 'Responsable',
  situacion_necesidad: 'Necesidad', objetivo_general: 'Objetivo', objetivos_especificos: 'Talleres', resultado_esperado: 'Comunidad capacitada',
};
let acciones, solicitudes, fallo, demorar;
test.beforeEach(async ({ context }) => {
  acciones = [{ id_accion: idAccion, id_plan: idPlan, nombre: 'Taller comunitario', responsable_nombre: 'María',
    fecha_inicio: '2020-01-01', fecha_termino: '2020-02-01', estado: 'en_desarrollo',
    descripcion: 'Formación comunitaria', observacion_motivo: null, resultado_esperado: 'Vecinos capacitados', version: 4, plan: { id_plan: idPlan, nombre: plan.nombre } }];
  solicitudes = []; fallo = ''; demorar = false;
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({
    access_token: 'qa-admin', refresh_token: 'qa-refresh', expires_at: Math.floor(Date.now()/1000)+3600,
    token_type: 'bearer', user: { id: '17600000-0000-4000-8000-000000000001', email: 'qa@example.test', user_metadata: {} },
  })));
  await context.route('**/api/v1/auth/session', route => route.fulfill({ json: {
    ok: true, code: 'SESION_VALIDA', message: 'Sesión de QA válida.',
    data: { authenticated: true, user: { id: '17600000-0000-4000-8000-000000000001', email: 'qa@example.test' } },
  } }));
  await context.route('**/rest/v1/rpc/get_user_roles', route => route.fulfill({ json: [{ codigo: 'ADMIN', alcance: 'global', id_pais: null }] }));
  await context.route(/\/api\/v1\/(?:plans|actions)(?:\/.*)?(?:\?.*)?$/, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const entrada = req.method() === 'GET' ? Object.fromEntries(url.searchParams) : req.postDataJSON();
    const planDetalle = /^\/api\/v1\/plans\/[^/]+$/.test(url.pathname);
    const accionDetalle = /^\/api\/v1\/actions\/[^/]+$/.test(url.pathname);
    const nombre = planDetalle ? 'obtenerPlanPorId'
      : url.pathname === '/api/v1/actions' && req.method() === 'GET' ? 'listarAcciones'
      : url.pathname === '/api/v1/actions' && req.method() === 'POST' ? 'crearAccion'
      : accionDetalle && req.method() === 'PATCH' ? 'actualizarAccion'
      : accionDetalle ? 'obtenerAccionPorId' : 'desconocido';
    solicitudes.push({ nombre, entrada });
    if (demorar && nombre === 'crearAccion') await new Promise(resolve => setTimeout(resolve, 350));
    if (fallo && nombre !== 'obtenerPlanPorId') {
      await route.fulfill({ status: fallo === 'CONFLICTO_CONCURRENCIA' ? 409 : fallo === 'NO_ENCONTRADA' ? 404 : 502, json: { ok: false, error: { code: fallo,
        message: fallo === 'CONFLICTO_CONCURRENCIA' ? 'La acción fue modificada por otra sesión. Recarga los datos antes de guardar.' : 'No fue posible cargar las acciones.' }, data: null } }); return;
    }
    if (nombre === 'crearAccion') acciones.push({ ...entrada, id_accion: idAccion, version: 1, plan: { id_plan: idPlan, nombre: plan.nombre } });
    if (nombre === 'actualizarAccion') acciones[0] = { ...acciones[0], ...entrada.cambios, version: acciones[0].version + 1 };
    const data = nombre === 'obtenerPlanPorId' ? { plan }
      : nombre === 'listarAcciones' ? { actions: acciones }
      : { action: nombre === 'crearAccion' ? acciones.at(-1) : acciones[0] };
    await route.fulfill({ json: { ok: true, code: 'QA_OK', message: 'Respuesta simulada.', data } });
  });
});

test('lista por plan y abre detalle con estado y vencimiento', async ({ page }) => {
  const errores = []; page.on('pageerror', error => errores.push(error.message));
  await page.goto(rutaPlan);
  await expect(page.locator('#acciones-listado article')).toHaveCount(1);
  expect(solicitudes.find(s => s.nombre === 'listarAcciones').entrada).toEqual({ id_plan: idPlan });
  await expect(page.locator('[data-vencida]')).toBeVisible();
  await page.getByRole('link', { name: 'Ver detalle', exact: true }).click();
  await expect(page.locator('[data-accion="nombre"]')).toHaveText('Taller comunitario');
  await expect(page.locator('[data-accion="estado"]')).toHaveText('En desarrollo');
  await expect(page.locator('[data-accion="descripcion"]')).toHaveText('Formación comunitaria');
  await expect(page.locator('#accion-vencida')).toBeVisible();
  await expect(page.locator('[data-accion="responsable_nombre"]')).toHaveText('María');
  expect(errores).toEqual([]);
});

test('crea sin evidencias, valida fechas y cancelación, bloquea doble envío y confirma', async ({ page }) => {
  acciones = [];
  await page.goto(rutaPlan);
  await expect(page.locator('#acciones-estado')).toContainText('todavía no tiene acciones');
  await page.getByRole('link', { name: 'Crear acción', exact: true }).click();
  await expect(page.locator('#guardar-accion')).toBeEnabled();
  await expect(page.locator('#estado option')).toHaveCount(4);
  await page.getByRole('button', { name: 'Guardar acción' }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(4);
  await page.locator('#nombre').fill('Jornada de formación');
  await page.locator('#descripcion').fill('Taller para vecinos');
  await page.locator('#responsable_nombre').fill('Pedro');
  await page.locator('#fecha_inicio').fill('2026-10-10');
  await page.locator('#fecha_termino').fill('2026-10-01');
  await page.locator('#estado').selectOption('cancelada');
  await page.getByRole('button', { name: 'Guardar acción' }).click();
  await expect(page.locator('#fecha_termino')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#observacion_motivo')).toHaveAttribute('aria-invalid', 'true');
  expect(solicitudes.some(s => s.nombre === 'crearAccion')).toBe(false);
  await page.locator('#fecha_termino').fill('2026-10-11');
  await page.locator('#observacion_motivo').fill('Cambio de disponibilidad');
  demorar = true;
  await page.getByRole('button', { name: 'Guardar acción' }).click();
  await expect(page.locator('#guardar-accion')).toBeDisabled();
  await expect(page.locator('#accion-confirmacion')).toBeVisible();
  await expect(page.locator('#acciones-listado h3')).toHaveText('Jornada de formación');
  expect(solicitudes.filter(s => s.nombre === 'crearAccion')).toHaveLength(1);
  expect(solicitudes.find(s => s.nombre === 'crearAccion').entrada.id_plan).toBe(idPlan);
  expect(solicitudes.find(s => s.nombre === 'crearAccion').entrada.descripcion).toBe('Taller para vecinos');
});

test('edita, conserva cambios ante conflicto y vuelve al listado de acciones', async ({ page }) => {
  await page.goto(`${rutaAccion}/editar`);
  await expect(page.locator('#nombre')).toHaveValue('Taller comunitario');
  await page.locator('#nombre').fill('Taller actualizado');
  fallo = 'CONFLICTO_CONCURRENCIA';
  await page.getByRole('button', { name: 'Guardar acción' }).click();
  await expect(page.locator('#accion-error')).toContainText('otra sesión');
  await expect(page.locator('#nombre')).toHaveValue('Taller actualizado');
  await expect(page.locator('#guardar-accion')).toBeDisabled();
  fallo = '';
  await page.getByRole('button', { name: 'Recargar datos' }).click();
  await expect(page.locator('#nombre')).toHaveValue('Taller comunitario');
  await page.locator('#nombre').fill('Taller actualizado');
  await page.locator('#estado').selectOption('cumplida');
  await page.getByRole('button', { name: 'Guardar acción' }).click();
  await expect(page.locator('#accion-confirmacion')).toBeVisible();
  expect(solicitudes.filter(s => s.nombre === 'actualizarAccion').at(-1).entrada.version_esperada).toBe(4);
  await expect(page.locator('[data-vencida]')).toBeHidden();
  await page.reload();
  await expect(page.locator('#acciones-listado h3')).toHaveText('Taller actualizado');
});

test('errores de listado y detalle permiten reintentar; rechaza otra asociación de plan', async ({ page }) => {
  fallo = 'ERROR_BASE_DATOS';
  await page.goto(rutaPlan);
  await expect(page.locator('#acciones-error')).toBeVisible();
  fallo = '';
  await page.getByRole('button', { name: 'Actualizar acciones' }).click();
  await expect(page.locator('#acciones-listado article')).toHaveCount(1);
  fallo = 'NO_ENCONTRADA';
  await page.goto(rutaAccion);
  await expect(page.locator('#detalle-error')).toBeVisible();
  fallo = '';
  await page.getByRole('button', { name: 'Reintentar carga' }).click();
  await expect(page.locator('#detalle-contenido')).toBeVisible();
  acciones[0].id_plan = '17600000-0000-4000-8000-000000000003';
  await page.goto(`${rutaAccion}/editar`);
  await expect(page.locator('#accion-error')).toContainText('no pertenece a este plan');
  await expect(page.locator('#guardar-accion')).toBeDisabled();
});

test('formulario y detalle caben en móvil; cancelar no guarda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${rutaAccion}/editar`);
  await expect(page.locator('#nombre')).toHaveValue('Taller comunitario');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#nombre').fill('No guardar');
  await page.getByRole('link', { name: 'Cancelar', exact: true }).click({ force: true });
  await expect(page.locator('#acciones-listado article')).toHaveCount(1);
  expect(solicitudes.some(s => s.nombre === 'actualizarAccion')).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Ver detalle', exact: true }).click();
  await expect(page.locator('#detalle-contenido')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
