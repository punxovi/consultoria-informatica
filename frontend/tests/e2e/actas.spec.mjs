import { test, expect } from '@playwright/test';

let fixture;
async function sesion(context, token = 'qa-admin') {
  await context.addCookies([{ name: 'fge_access_token', value: token, url: 'http://127.0.0.1:4333' }]);
  await context.addInitScript(token => localStorage.setItem('sb-127-auth-token', JSON.stringify({
    access_token: token, refresh_token: 'qa-refresh', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '17600000-0000-4000-8000-000000000001', email: 'qa@example.invalid', user_metadata: {} },
  })), token);
  await context.route('**/api/v1/auth/session', route => route.fulfill({ json: { ok: true, data: { authenticated: true, user: { id: '17600000-0000-4000-8000-000000000001' } } } }));
}
async function datos(request, body = {}) {
  const r = await request.post(`${process.env.QA_ACTAS_SUPABASE}/__qa/fixture`, { headers: { authorization: 'Bearer qa-admin' }, data: body });
  expect(r.ok()).toBe(true); return r.json();
}
test.beforeEach(async ({ context, request }) => { fixture = await datos(request); await sesion(context); });
async function abrir(page) {
  await page.goto(`/organizaciones/${fixture.organizacion.id_organizacion}`);
  await page.locator('[data-tab="intervenciones"]').click();
  await page.locator('[data-org-seccion="actas"]').click();
}
async function completar(page) {
  await page.locator('#actas-plan').selectOption(fixture.planes[0].id_plan);
  await page.locator('#actas-accion').selectOption(fixture.acciones[0].id_accion);
  await page.locator('#actas-asistentes').selectOption('QA ADMIN');
  await page.locator('#actas-fecha').fill('2026-10-08');
  await page.locator('#actas-objetivo').fill('Coordinar actividades de la organización');
}
async function crear(page) {
  await abrir(page); await page.locator('#actas-nueva').click(); await completar(page);
  await page.locator('#actas-guardar').click(); await expect(page.locator('#actas-mensaje')).toContainText('se registró correctamente');
}

test('registra con compromisos, recarga, consulta y actualiza mediante Gateway y SQL', async ({ page }) => {
  const errores = []; page.on('pageerror', e => errores.push(e.message));
  const escrituras = []; page.on('request', r => { if (r.url().includes('/meeting-minutes') && ['POST','PATCH'].includes(r.method())) escrituras.push(r); });
  await abrir(page); await expect(page.locator('#actas-vacio')).toBeVisible();
  await page.locator('#actas-nueva').click(); await completar(page);
  for (const descripcion of ['Preparar el informe','Revisar los antecedentes']) {
    await page.locator('#actas-agregar-compromiso').click();
    const grupo = page.locator('[data-borradores] fieldset').last();
    for (const [campo,valor] of Object.entries({ descripcion,responsable_nombre:'Ana',responsable_contacto:'ana@example.invalid',fecha_limite:'2026-12-01' })) {
      await grupo.locator(`[data-campo="${campo}"]`).fill(valor);
    }
  }
  await page.locator('#actas-guardar').click(); await expect(page.locator('#actas-mensaje')).toContainText('se registró correctamente');
  await abrir(page); await expect(page.locator('#cantidad-actas')).toHaveText('1 acta registrada');
  await page.locator('[data-ver-acta]').click();
  await expect(page.locator('#detalle-plan')).toHaveText(fixture.planes[0].nombre);
  await expect(page.locator('#detalle-accion')).toHaveText(fixture.acciones[0].nombre);
  await expect(page.locator('#actas-compromisos-detalle')).toContainText('Preparar el informe');
  await expect(page.locator('#actas-compromisos-detalle')).toContainText('Revisar los antecedentes');
  await page.locator('#actas-editar').click();
  await expect(page.locator('#actas-fecha')).toHaveValue('2026-10-08');
  await page.locator('#actas-objetivo').fill('Seguimiento actualizado');
  await page.locator('#actas-accion').selectOption('');
  await page.locator('#actas-guardar').click(); await expect(page.locator('#actas-mensaje')).toContainText('se actualizó correctamente');
  await abrir(page); await page.locator('[data-ver-acta]').click();
  await expect(page.locator('#detalle-objetivo')).toHaveText('Seguimiento actualizado');
  await expect(page.locator('#detalle-accion')).toHaveText('Sin acción asociada');
  await expect(page.locator('#actas-compromisos-detalle p')).toHaveCount(2);
  expect(escrituras.map(r => r.method())).toEqual(['POST','PATCH']);
  expect(escrituras.every(r => r.url().startsWith(process.env.QA_ACTAS_GATEWAY))).toBe(true);
  expect(escrituras[1].postDataJSON().version_esperada).toBe(1);
  expect(errores).toEqual([]);
});

test('valida campos y compromisos; filtra acciones al cambiar el plan', async ({ page }) => {
  const errores = []; page.on('pageerror', error => errores.push(error.message));
  let envios = 0; page.on('request', r => { if (r.url().includes('/meeting-minutes') && r.method() === 'POST') envios++; });
  await abrir(page); await page.locator('#actas-nueva').click(); await page.locator('#actas-guardar').click();
  await expect(page.locator('#actas-objetivo')).toHaveAttribute('aria-invalid','true');
  await expect(page.locator('#actas-asistentes')).toHaveAttribute('aria-invalid','true');
  for (const campo of ['plan', 'objetivo', 'asistentes']) {
    await expect(page.locator(`#error-${campo}-acta`)).toBeVisible();
    await expect(page.locator(`#error-${campo}-acta`)).not.toBeEmpty();
  }
  await page.locator('#actas-fecha').fill('');
  await page.locator('#actas-guardar').click();
  await expect(page.locator('#error-fecha-acta')).toBeVisible();
  await expect(page.locator('#error-fecha-acta')).toContainText('fecha válida');
  await completar(page);
  await page.locator('#actas-plan').selectOption(fixture.planes[1].id_plan);
  await expect(page.locator('#actas-accion')).toHaveValue('');
  await expect(page.locator('#actas-accion option')).toHaveCount(2);
  await expect(page.locator('#actas-accion option').last()).toHaveAttribute('value',fixture.acciones[1].id_accion);
  await page.locator('#actas-fecha').fill('2099-01-01'); await page.locator('#actas-guardar').click();
  await expect(page.locator('#error-fecha-acta')).toBeVisible();
  await expect(page.locator('#error-fecha-acta')).toContainText('posterior a hoy');
  await page.locator('#actas-fecha').fill('2026-10-08'); await page.locator('#actas-agregar-compromiso').click();
  await page.locator('#actas-guardar').click(); await expect(page.locator('[data-campo="responsable_contacto"]')).toHaveAttribute('aria-invalid','true');
  expect(envios).toBe(0);
  expect(errores).toEqual([]);
});

test('distingue carga, error y vacío; permite reintentar', async ({ page }) => {
  let liberar; const espera = new Promise(r => { liberar = r; });
  await page.route('**/meeting-minutes?*', async route => { await espera; await route.fulfill({ status:503,json:{ok:false,error:{code:'NO_DISPONIBLE',message:'El servicio de Actas no está disponible.'}} }); });
  await abrir(page); await expect(page.locator('#actas-carga')).toBeVisible(); await expect(page.locator('#actas-nueva')).toBeDisabled();
  liberar(); await expect(page.locator('#actas-error')).toContainText('no está disponible');
  await expect(page.locator('#actas-vacio')).toBeHidden();
  await page.unroute('**/meeting-minutes?*'); await page.locator('#actas-recargar').click();
  await expect(page.locator('#actas-vacio')).toBeVisible(); await expect(page.locator('#actas-nueva')).toBeEnabled();
});

test('fallo al guardar conserva el borrador; bloquea doble envío y permite reintento', async ({ page }) => {
  await abrir(page); await page.locator('#actas-nueva').click(); await completar(page);
  await page.route('**/meeting-minutes', route => route.fulfill({ status:403,json:{ok:false,error:{code:'SIN_PERMISO',message:'No tienes permiso para guardar.'}} }));
  await page.locator('#actas-guardar').click(); await expect(page.locator('#actas-error')).toHaveText('No tienes permiso para guardar.');
  await expect(page.locator('#actas-mensaje')).toBeHidden(); await expect(page.locator('#actas-objetivo')).toHaveValue('Coordinar actividades de la organización');
  await page.unroute('**/meeting-minutes');
  let liberar, envios = 0; const espera = new Promise(r => { liberar = r; });
  await page.route('**/meeting-minutes', async route => { envios++; await espera; await route.continue(); });
  await page.locator('#actas-guardar').click();
  await expect(page.locator('#actas-objetivo')).toBeDisabled(); await expect(page.locator('#actas-cancelar')).toBeDisabled();
  await page.locator('#actas-formulario').evaluate(f => f.dispatchEvent(new Event('submit', { cancelable:true })));
  liberar(); await expect(page.locator('#actas-mensaje')).toContainText('se registró correctamente'); expect(envios).toBe(1);
});

test('conflicto real entre pestañas conserva el borrador hasta recargar', async ({ page, context }) => {
  await crear(page); const otra = await context.newPage(); await abrir(otra);
  for (const tab of [page,otra]) { await tab.locator('[data-ver-acta]').click(); await tab.locator('#actas-editar').click(); }
  await page.locator('#actas-objetivo').fill('Versión de la primera pestaña');
  await otra.locator('#actas-objetivo').fill('Mi borrador');
  await page.locator('#actas-guardar').click(); await expect(page.locator('#actas-mensaje')).toContainText('se actualizó');
  await otra.locator('#actas-guardar').click(); await expect(otra.locator('#actas-error')).toContainText('otra sesión');
  await expect(otra.locator('#actas-objetivo')).toHaveValue('Mi borrador'); await expect(otra.locator('#actas-guardar')).toBeDisabled();
  otra.once('dialog',d=>d.dismiss()); await otra.locator('#actas-recargar').click(); await expect(otra.locator('#actas-objetivo')).toHaveValue('Mi borrador');
  otra.once('dialog',d=>d.accept()); await otra.locator('#actas-recargar').click();
  await expect(otra.locator('#lista-actas')).toContainText('Versión de la primera pestaña'); await otra.close();
});

test('coordinador fuera de su país puede consultar pero no editar', async ({ page, context, request }) => {
  fixture = await datos(request,{pais:'AR'}); await crear(page);
  await sesion(context,'qa-coord'); await abrir(page);
  await expect(page.locator('#actas-catalogo-estado')).toContainText('No tienes permiso');
  await expect(page.locator('#actas-nueva')).toBeHidden(); await page.locator('[data-ver-acta]').click(); await expect(page.locator('#actas-editar')).toBeHidden();
});

test('sin planes deshabilita creación; formulario móvil y cancelar no guardan', async ({ page, request }, info) => {
  fixture = await datos(request,{conPlan:false}); await abrir(page);
  await expect(page.locator('#actas-vacio')).toBeVisible(); await expect(page.locator('#actas-nueva')).toBeDisabled();
  await expect(page.locator('#actas-catalogo-estado')).toContainText('Registra un plan');
  fixture = await datos(request); await page.setViewportSize({width:390,height:844}); await abrir(page);
  await page.locator('#actas-nueva').click(); await completar(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('actas-movil.png'),fullPage:true});
  await page.locator('#actas-cancelar').click(); await expect(page.locator('#actas-vacio')).toBeVisible();
});
