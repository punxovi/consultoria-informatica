import { test, expect } from '@playwright/test';

const chile = '14700000-0000-4000-8000-000000000001';
const peru = '14700000-0000-4000-8000-000000000002';
const paises = [{ id_pais: chile, nombre: 'Chile', codigo_iso: 'CL' }, { id_pais: peru, nombre: 'Perú', codigo_iso: 'PE' }];
const uid = (n) => `14700000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const base = () => [
  { id_usuario: uid(11), nombre: 'Ana Ñúñez', correo: 'ana@fge.org', id_pais: chile, pais: paises[0], activo: true, version: 1 },
  { id_usuario: uid(12), nombre: 'Bruno Díaz', correo: 'bruno@fge.org', id_pais: peru, pais: paises[1], activo: false, version: 2 },
  { id_usuario: uid(13), nombre: 'Carla Soto', correo: 'csoto@fge.org', id_pais: chile, pais: paises[0], activo: true, version: 1 },
];

let servidor;
function nuevoServidor(rol = 'ADMIN') {
  return { rol, cuentas: base(), solicitudes: [], fallar: {}, retrasoListado: 0, listadoVacio: false, sinRuta: false };
}
const ok = (data) => ({ json: { ok: true, code: 'OK', message: 'OK', data } });
const falla = (status, code, message, fields) => ({ status, json: { ok: false, error: { code, message, requestId: 'qa', ...(fields ? { fields } : {}) }, data: null } });

test.beforeEach(async ({ context }) => {
  servidor = nuevoServidor();
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'qa', refresh_token: 'qa', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '14700000-0000-4000-8000-0000000000ad', email: 'admin@fge.org', user_metadata: {} } })));
  await context.route('http://127.0.0.1:54329/**', (r) => r.fulfill({ json: [{ codigo: servidor.rol, alcance: servidor.rol === 'ADMIN' ? 'global' : 'pais', id_pais: servidor.rol === 'ADMIN' ? null : chile }] }));
  await context.route('**/api/v1/auth/session', (r) => r.fulfill({ json: { ok: true, data: { authenticated: true, user: { id: uid(99) } } } }));
  await context.route('**/api/v1/organizations/countries', (r) => (servidor.fallar.paises ? r.fulfill(falla(500, 'ERROR', 'x')) : r.fulfill(ok({ countries: paises }))));
  await context.route('**/api/v1/coordinators**', async (r) => {
    const req = r.request();
    const ruta = new URL(req.url()).pathname.replace('/api/v1/coordinators', '');
    const cuerpo = req.postData() ? req.postDataJSON() : undefined;
    servidor.solicitudes.push({ metodo: req.method(), ruta, cuerpo });
    if (servidor.sinRuta) return r.fulfill(falla(404, 'RUTA_NO_ENCONTRADA', 'La ruta solicitada no existe en el API Gateway.'));
    const [, id, accion] = ruta.split('/');
    const cuenta = servidor.cuentas.find((c) => c.id_usuario === id);
    if (req.method() === 'GET' && !id) {
      if (servidor.retrasoListado) await new Promise((res) => setTimeout(res, servidor.retrasoListado));
      if (servidor.fallar.listar) { servidor.fallar.listar--; return r.fulfill(falla(503, 'ERROR', 'Servicio caído')); }
      return r.fulfill(ok({ coordinators: servidor.listadoVacio ? [] : servidor.cuentas }));
    }
    if (req.method() === 'GET') return cuenta ? r.fulfill(ok({ coordinator: cuenta })) : r.fulfill(falla(404, 'NO_EXISTE', 'No existe'));
    if (req.method() === 'POST' && !id) {
      if (servidor.cuentas.some((c) => c.correo === cuerpo.correo)) return r.fulfill(falla(409, 'CORREO_DUPLICADO', 'Correo en uso', { correo: ['Ya existe una cuenta con ese correo.'] }));
      const nueva = { id_usuario: uid(20 + servidor.cuentas.length), ...cuerpo, pais: paises.find((p) => p.id_pais === cuerpo.id_pais), activo: true, version: 1 };
      servidor.cuentas.push(nueva);
      return r.fulfill(ok({ coordinator: nueva }));
    }
    if (!cuenta) return r.fulfill(falla(404, 'NO_EXISTE', 'No existe'));
    if (cuerpo.version_esperada !== cuenta.version) return r.fulfill(falla(409, 'VERSION', 'Versión antigua'));
    if (servidor.fallar.estado) return r.fulfill(falla(503, 'ERROR', 'Servicio caído'));
    if (req.method() === 'POST') Object.assign(cuenta, { activo: accion === 'activate' });
    else Object.assign(cuenta, cuerpo.cambios, cuerpo.cambios.id_pais ? { pais: paises.find((p) => p.id_pais === cuerpo.cambios.id_pais) } : {});
    cuenta.version += 1;
    return r.fulfill(ok({ coordinator: cuenta }));
  });
});

async function listado(page) {
  await page.goto('/administracion/coordinadores');
  await expect(page.locator('#coord-lista .coord-tarjeta')).toHaveCount(servidor.listadoVacio ? 0 : servidor.cuentas.length);
}
const tarjeta = (page, nombre) => page.locator('.coord-tarjeta', { hasText: nombre });
const soloEscrituras = () => servidor.solicitudes.filter((s) => s.metodo !== 'GET');

test('recargar la página recupera el catálogo de países después de un fallo temporal', async ({ page }) => {
  servidor.fallar.paises = true;
  await listado(page);
  await expect(page.locator('#coord-filtro-pais')).toBeDisabled();
  servidor.fallar.paises = false;
  await page.reload();
  await expect(page.locator('#coord-filtro-pais')).toBeEnabled();
  await expect(page.locator('#coord-filtro-pais option')).toHaveCount(3);
  await page.locator('#coord-filtro-pais').selectOption(peru);
  await expect(page.locator('.coord-tarjeta h3')).toHaveText(['Bruno Díaz']);
});

test('cambio de estado bloquea las acciones y muestra la versión nueva', async ({ page }) => {
  await listado(page);
  const anteriores = structuredClone(servidor.cuentas);

  let liberarEstado;
  const esperaEstado = new Promise(resolve => { liberarEstado = resolve; });
  await page.route(`**/api/v1/coordinators/${uid(12)}/activate`, async r => {
    await esperaEstado;
    await r.fulfill(ok({ coordinator: { ...anteriores[1], activo: true, version: 3 } }));
  });
  await tarjeta(page, 'Bruno Díaz').getByRole('button').click();
  await expect(tarjeta(page, 'Ana Ñúñez').getByRole('button')).toBeDisabled();
  liberarEstado();
  await expect(tarjeta(page, 'Bruno Díaz').locator('.coord-estado-badge')).toHaveText('Activa');
  await expect(page.locator('#coord-confirmacion')).toContainText('fue activada');
});
async function captura(page, info, nombre) {
  await page.addStyleTag({ content: 'astro-dev-toolbar { display: none !important; }' });
  await expect(page.locator('#main-content')).toHaveCSS('opacity', '1');
  await page.screenshot({ path: info.outputPath(`${nombre}.png`), fullPage: true });
  expect(await page.locator('#main-content').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
}

test('listado: nombre, correo, país principal y estado de cada Coordinador, con métricas', async ({ page }, info) => {
  const errores = []; page.on('pageerror', (e) => errores.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await listado(page);
  const ana = tarjeta(page, 'Ana Ñúñez');
  await expect(ana).toContainText('ana@fge.org');
  await expect(ana).toContainText('Chile');
  await expect(ana.locator('.coord-estado-badge')).toHaveText('Activa');
  const bruno = tarjeta(page, 'Bruno Díaz');
  await expect(bruno).toContainText('Perú');
  await expect(bruno.locator('.coord-estado-badge')).toHaveText('Inactiva');
  await expect(bruno).toContainText('Acceso bloqueado');
  await expect(page.locator('.coord-tarjeta h3')).toHaveText(['Ana Ñúñez', 'Carla Soto', 'Bruno Díaz']);
  await expect(page.locator('#coord-total')).toHaveText('3');
  await expect(page.locator('#coord-activas')).toHaveText('2');
  await expect(page.locator('#coord-inactivas')).toHaveText('1');
  await expect(bruno.getByRole('button', { name: 'Activar la cuenta de Bruno Díaz' })).toBeVisible();
  await expect(ana.getByRole('link', { name: 'Editar la cuenta de Ana Ñúñez' })).toHaveAttribute('href', `/administracion/coordinadores/${uid(11)}/editar`);
  await expect(page.getByRole('link', { name: 'Coordinadores' })).toBeVisible();
  await captura(page, info, 'coordinadores-escritorio');
  expect(errores).toEqual([]);
});

test('un Coordinador no ve el acceso ni la gestión de cuentas', async ({ page }) => {
  servidor.rol = 'COORD';
  await page.goto('/administracion/coordinadores');
  await expect(page.locator('#unauthorized-message')).toBeVisible();
  await expect(page.locator('#page-content')).toBeHidden();
  await expect(page.locator('a[data-nav-roles]')).toBeHidden();
  await page.goto('/dashboard');
  await expect(page.locator('a[data-nav-roles]')).toBeHidden();
});

test('estados: carga, error con reintento, servicio no disponible y ausencia de cuentas', async ({ page }) => {
  servidor.retrasoListado = 800;
  servidor.fallar.listar = 1;
  await page.goto('/administracion/coordinadores');
  await expect(page.locator('#coord-carga')).toBeVisible();
  await expect(page.locator('#coord-lista')).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('#coord-error')).toBeVisible();
  await expect(page.locator('#coord-error-texto')).toContainText('No fue posible cargar las cuentas de Coordinadores');
  await expect(page.locator('#coord-carga')).toBeHidden();
  await expect(page.locator('#coord-total')).toHaveText('—');
  await page.locator('#coord-reintentar').click();
  await expect(page.locator('#coord-lista .coord-tarjeta')).toHaveCount(3);
  await expect(page.locator('#coord-error')).toBeHidden();

  servidor.retrasoListado = 0;
  servidor.listadoVacio = true;
  await page.reload();
  await expect(page.locator('#coord-vacio')).toBeVisible();
  await expect(page.locator('#coord-vacio')).toContainText('Todavía no hay cuentas de Coordinadores');
  await expect(page.locator('#coord-vacio').getByRole('link', { name: 'Crear el primer coordinador' })).toBeVisible();
  await expect(page.locator('#coord-total')).toHaveText('0');

  servidor.sinRuta = true;
  await page.reload();
  await expect(page.locator('#coord-error-texto')).toHaveText('El servicio de cuentas de Coordinadores todavía no está disponible.');
  await expect(page.locator('#coord-vacio')).toBeHidden();
});

test('filtros: búsqueda, estado y país; sin resultados y limpiar', async ({ page }) => {
  await listado(page);
  await page.locator('#coord-buscar').fill('NUNEZ');
  await expect(page.locator('.coord-tarjeta h3')).toHaveText(['Ana Ñúñez']);
  await expect(page.locator('#coord-estado')).toHaveText('1 de 3 cuentas.');
  await page.locator('#coord-buscar').fill('');
  await page.locator('#coord-filtro-estado').selectOption('inactivas');
  await expect(page.locator('.coord-tarjeta h3')).toHaveText(['Bruno Díaz']);
  await page.locator('#coord-filtro-estado').selectOption('todas');
  await page.locator('#coord-filtro-pais').selectOption({ label: 'Chile' });
  await expect(page.locator('.coord-tarjeta h3')).toHaveText(['Ana Ñúñez', 'Carla Soto']);
  await page.locator('#coord-buscar').fill('zzz');
  await expect(page.locator('#coord-sin-resultados')).toBeVisible();
  await expect(page.locator('#coord-vacio')).toBeHidden();
  await page.locator('#coord-limpiar').click();
  await expect(page.locator('.coord-tarjeta')).toHaveCount(3);
  await expect(page.locator('#coord-filtro-pais')).toHaveValue('');
  await expect(page.locator('#coord-limpiar')).toBeDisabled();
});

test('desactivar exige confirmación visual; cancelar no envía nada y confirmar actualiza la cuenta', async ({ page }, info) => {
  await listado(page);
  const ana = tarjeta(page, 'Ana Ñúñez');
  await ana.getByRole('button', { name: 'Desactivar la cuenta de Ana Ñúñez' }).click();
  const dialogo = page.locator('#coord-dialogo');
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText('Ana Ñúñez (ana@fge.org) dejará de tener acceso al sistema.');
  await expect(dialogo).toContainText('Sus registros se conservan visibles con su autoría original.');
  await captura(page, info, 'coordinadores-confirmar-desactivacion');
  await page.locator('#coord-dialogo-cancelar').click();
  await expect(dialogo).toBeHidden();
  expect(soloEscrituras()).toEqual([]);
  await expect(ana.locator('.coord-estado-badge')).toHaveText('Activa');

  await ana.getByRole('button', { name: 'Desactivar la cuenta de Ana Ñúñez' }).click();
  await page.locator('#coord-dialogo-confirmar').click();
  await expect(dialogo).toBeHidden();
  expect(soloEscrituras()).toEqual([{ metodo: 'POST', ruta: `/${uid(11)}/deactivate`, cuerpo: { version_esperada: 1 } }]);
  await expect(ana.locator('.coord-estado-badge')).toHaveText('Inactiva');
  await expect(page.locator('#coord-confirmacion')).toHaveText('La cuenta de Ana Ñúñez fue desactivada. Sus registros se conservan con su autoría.');
  await expect(page.locator('#coord-activas')).toHaveText('1');
  await expect(page.locator('#coord-inactivas')).toHaveText('2');
  await expect(ana.getByRole('button', { name: 'Activar la cuenta de Ana Ñúñez' })).toBeVisible();
});

test('activar una cuenta inactiva muestra la confirmación; un error al desactivar se informa en el diálogo', async ({ page }) => {
  await listado(page);
  await tarjeta(page, 'Bruno Díaz').getByRole('button', { name: 'Activar la cuenta de Bruno Díaz' }).click();
  await expect(tarjeta(page, 'Bruno Díaz').locator('.coord-estado-badge')).toHaveText('Activa');
  await expect(page.locator('#coord-confirmacion')).toContainText('La cuenta de Bruno Díaz fue activada');
  expect(soloEscrituras()).toEqual([{ metodo: 'POST', ruta: `/${uid(12)}/activate`, cuerpo: { version_esperada: 2 } }]);

  servidor.fallar.estado = true;
  await tarjeta(page, 'Carla Soto').getByRole('button', { name: 'Desactivar la cuenta de Carla Soto' }).click();
  await page.locator('#coord-dialogo-confirmar').click();
  await expect(page.locator('#coord-dialogo-error')).toContainText('No fue posible desactivar la cuenta');
  await expect(page.locator('#coord-dialogo')).toBeVisible();
  await expect(page.locator('#coord-dialogo-confirmar')).toBeEnabled();
  await expect(tarjeta(page, 'Carla Soto').locator('.coord-estado-badge')).toHaveText('Activa');
});

test('crear: campos obligatorios, validación junto al campo y confirmación al guardar', async ({ page }, info) => {
  await page.goto('/administracion/coordinadores');
  await page.locator('#coord-nuevo').click();
  await expect(page).toHaveURL(/\/administracion\/coordinadores\/nuevo$/);
  await expect(page.locator('#cf-form')).toBeVisible();
  for (const etiqueta of ['Nombre completo', 'Correo electrónico', 'País principal']) {
    await expect(page.locator('label', { hasText: etiqueta }).locator('span', { hasText: '*' })).toBeVisible();
  }
  await expect(page.locator('#cf-pais option')).toHaveText(['Selecciona un país', 'Chile', 'Perú']);

  await page.locator('#cf-guardar').click();
  await expect(page.locator('#cf-nombre-error')).toHaveText('Ingresa el nombre del Coordinador.');
  await expect(page.locator('#cf-correo-error')).toHaveText('Ingresa el correo electrónico.');
  await expect(page.locator('#cf-id_pais-error')).toHaveText('Selecciona el país principal.');
  await expect(page.locator('#cf-pais')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#cf-pais')).toHaveAttribute('aria-describedby', /cf-id_pais-error/);
  await expect(page.locator('#cf-nombre')).toBeFocused();
  await expect(page.locator('#cf-error-general')).toHaveText('Corrige los campos marcados antes de continuar.');
  await captura(page, info, 'coordinador-nuevo-errores');

  await page.locator('#cf-nombre').fill('Diego Rivas');
  await expect(page.locator('#cf-nombre-error')).toHaveCount(0);
  await page.locator('#cf-correo').fill('diego@');
  await page.locator('#cf-guardar').click();
  await expect(page.locator('#cf-correo-error')).toContainText('correo electrónico válido');
  await page.locator('#cf-correo').fill(' Diego@FGE.org ');
  await page.locator('#cf-guardar').click();
  await expect(page.locator('#cf-id_pais-error')).toHaveText('Selecciona el país principal.');
  await expect(page.locator('#cf-correo-error')).toHaveCount(0);
  expect(soloEscrituras()).toEqual([]);

  await page.locator('#cf-pais').selectOption({ label: 'Perú' });
  await page.locator('#cf-guardar').click();
  await expect(page).toHaveURL(/\/administracion\/coordinadores$/);
  expect(soloEscrituras()).toEqual([{ metodo: 'POST', ruta: '', cuerpo: { nombre: 'Diego Rivas', correo: 'diego@fge.org', id_pais: peru } }]);
  await expect(page.locator('#coord-confirmacion')).toHaveText('Cuenta de Coordinador creada correctamente.');
  await expect(tarjeta(page, 'Diego Rivas')).toContainText('Perú');
  await expect(page.locator('#coord-total')).toHaveText('4');
});

test('crear: un error del servicio por correo repetido se muestra junto al campo', async ({ page }) => {
  await page.goto('/administracion/coordinadores/nuevo');
  await page.locator('#cf-nombre').fill('Otra Ana');
  await page.locator('#cf-correo').fill('ana@fge.org');
  await page.locator('#cf-pais').selectOption({ label: 'Chile' });
  await page.locator('#cf-guardar').click();
  await expect(page.locator('#cf-correo-error')).toHaveText('Ya existe una cuenta con ese correo.');
  await expect(page.locator('#cf-correo')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL(/\/nuevo$/);
  await expect(page.locator('#cf-guardar')).toBeEnabled();
});

test('editar: precarga la cuenta, el correo es de solo lectura y solo se envían los cambios', async ({ page }) => {
  await listado(page);
  await tarjeta(page, 'Carla Soto').getByRole('link', { name: 'Editar la cuenta de Carla Soto' }).click();
  await expect(page.locator('#cf-nombre')).toHaveValue('Carla Soto');
  await expect(page.locator('#cf-correo')).toHaveValue('csoto@fge.org');
  await expect(page.locator('#cf-correo')).toHaveAttribute('readonly', '');
  await expect(page.locator('#cf-pais')).toHaveValue(chile);
  await expect(page.locator('#cf-estado-cuenta')).toContainText('Cuenta activa');
  await expect(page.locator('#cf-pais-ayuda')).toContainText('próximo inicio de sesión');

  await page.locator('#cf-guardar').click();
  await expect(page.locator('#cf-error-general')).toHaveText('No hay cambios para guardar.');
  await page.locator('#cf-nombre').fill('');
  await page.locator('#cf-guardar').click();
  await expect(page.locator('#cf-nombre-error')).toHaveText('Ingresa el nombre del Coordinador.');
  expect(soloEscrituras()).toEqual([]);

  await page.locator('#cf-nombre').fill('Carla Soto');
  await page.locator('#cf-pais').selectOption({ label: 'Perú' });
  await page.locator('#cf-guardar').click();
  await expect(page).toHaveURL(/\/administracion\/coordinadores$/);
  expect(soloEscrituras()).toEqual([{ metodo: 'PATCH', ruta: `/${uid(13)}`, cuerpo: { version_esperada: 1, cambios: { id_pais: peru } } }]);
  await expect(page.locator('#coord-confirmacion')).toHaveText('Cuenta de Coordinador actualizada correctamente.');
  await expect(tarjeta(page, 'Carla Soto')).toContainText('Perú');
});

test('editar: cuenta inexistente o catálogo de países caído muestran error con reintento', async ({ page }) => {
  await page.goto(`/administracion/coordinadores/${uid(77)}/editar`);
  await expect(page.locator('#cf-error-carga')).toBeVisible();
  await expect(page.locator('#cf-error-carga-texto')).toHaveText('La cuenta solicitada no existe o ya no está disponible.');
  await expect(page.locator('#cf-form')).toBeHidden();

  servidor.fallar.paises = true;
  await page.goto('/administracion/coordinadores/nuevo');
  await expect(page.locator('#cf-error-carga-texto')).toHaveText('No fue posible cargar el catálogo de países. Inténtalo nuevamente.');
  servidor.fallar.paises = false;
  await page.locator('#cf-reintentar').click();
  await expect(page.locator('#cf-form')).toBeVisible();
  await expect(page.locator('#cf-pais option')).toHaveCount(3);
});

test('móvil: sin desbordes y controles táctiles de al menos 48×48 px', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await listado(page);
  const medir = (selector) => page.locator(selector).evaluateAll((nodos) => nodos
    .filter((n) => n.getClientRects().length > 0)
    .map((n) => ({ id: n.id || n.getAttribute('aria-label') || n.textContent.trim(), w: n.getBoundingClientRect().width, h: n.getBoundingClientRect().height })));
  const pequenos = (lista) => lista.filter((c) => c.w < 48 || c.h < 48);
  expect(pequenos(await medir('#page-content button, #page-content a, #page-content input, #page-content select'))).toEqual([]);
  await captura(page, info, 'coordinadores-movil');

  await tarjeta(page, 'Ana Ñúñez').getByRole('button', { name: 'Desactivar la cuenta de Ana Ñúñez' }).click();
  expect(pequenos(await medir('#coord-dialogo button'))).toEqual([]);
  await page.locator('#coord-dialogo-cancelar').click();

  await page.goto('/administracion/coordinadores/nuevo');
  await expect(page.locator('#cf-form')).toBeVisible();
  await page.locator('#cf-guardar').click();
  expect(pequenos(await medir('#cf-form button, #cf-form a, #cf-form input, #cf-form select'))).toEqual([]);
  await captura(page, info, 'coordinador-nuevo-movil');
});
