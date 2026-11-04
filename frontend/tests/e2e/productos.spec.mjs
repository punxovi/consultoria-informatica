import { test, expect } from '@playwright/test';

const ORG_CL = '11111111-1111-4111-8111-111111111111';
const ORG_AR = '22222222-2222-4222-8222-222222222222';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const pais = { CL: { id_pais: 'p-cl', codigo_iso: 'CL', nombre: 'Chile' }, AR: { id_pais: 'p-ar', codigo_iso: 'AR', nombre: 'Argentina' } };
const organizacion = (id, nombre, p) => ({ id_organizacion: id, id_pais: p.id_pais, nombre, pais: p });
const organizaciones = [organizacion(ORG_CL, 'Comedor Solidario Las Palmas', pais.CL), organizacion(ORG_AR, 'Cooperativa Manos del Sur', pais.AR)];
const producto = (extra = {}) => ({
  id_producto: 'prod-1', id_organizacion: ORG_AR, nombre: 'Bolso reutilizable tejido',
  descripcion: 'Asas largas, lavable.', unidad_medida: 'Unidad', categoria: 'Textil', material: 'Textil reciclado',
  terminacion: 'Artesanal', publicado: false, version: 3, updated_at: '2026-11-01T12:00:00Z',
  organizacion: { id_organizacion: ORG_AR, nombre: 'Cooperativa Manos del Sur', pais: pais.AR }, imagenes: [], ...extra,
});

let estado;
test.beforeEach(async ({ context }) => {
  estado = { rol: 'ADMIN', productos: [producto(), producto({ id_producto: 'prod-2', id_organizacion: ORG_CL, nombre: 'Caja organizadora modular', categoria: 'Madera', material: 'Madera recuperada', terminacion: null, publicado: true, organizacion: { id_organizacion: ORG_CL, nombre: 'Comedor Solidario Las Palmas', pais: pais.CL } })], requests: [], error: false, delay: 0, fallarImagenes: false };
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'qa', refresh_token: 'qa', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '14700000-0000-4000-8000-000000000001', email: 'admin@fge.org', user_metadata: {} } })));
  await context.route('http://127.0.0.1:54329/**', (r) => r.fulfill({ json: [{ codigo: estado.rol, alcance: 'global', id_pais: null }] }));
  await context.route('**/api/v1/auth/session', (r) => r.fulfill({ json: { ok: true, data: { authenticated: true, user: { id: 'qa' } } } }));
  await context.route('**/api/v1/organizations', (r) => r.fulfill({ json: { ok: true, data: { organizations: organizaciones } } }));
  await context.route('**/api/v1/products**', async (r) => {
    const req = r.request();
    estado.requests.push(req);
    if (estado.delay) await new Promise((resolve) => setTimeout(resolve, estado.delay));
    if (estado.error) return r.fulfill({ status: 404, json: { ok: false, error: { code: 'RUTA_NO_ENCONTRADA', message: 'No existe' }, data: null } });
    const url = new URL(req.url());
    const partes = url.pathname.split('/').filter(Boolean); // api v1 products [id] [images]
    if (req.method() === 'GET') return r.fulfill({ json: { ok: true, data: { products: estado.productos } } });
    if (req.method() === 'POST' && partes.length === 3) {
      const body = req.postDataJSON();
      const org = organizaciones.find((o) => o.id_organizacion === body.id_organizacion);
      const nuevo = producto({ ...body, id_producto: 'prod-nuevo', version: 1, organizacion: { id_organizacion: org.id_organizacion, nombre: org.nombre, pais: org.pais } });
      estado.productos = [...estado.productos, nuevo];
      return r.fulfill({ status: 201, json: { ok: true, data: { product: nuevo } } });
    }
    if (req.method() === 'POST' && partes[4] === 'images') {
      if (estado.fallarImagenes) return r.fulfill({ status: 500, json: { ok: false, error: { code: 'ERROR', message: 'Falló' }, data: null } });
      return r.fulfill({ status: 201, json: { ok: true, data: { imagenes: [{ id_archivo: 'img-1' }] } } });
    }
    if (req.method() === 'PATCH') {
      const { cambios } = req.postDataJSON();
      const actual = estado.productos.find((p) => p.id_producto === partes[3]);
      const actualizado = { ...actual, ...cambios, version: actual.version + 1 };
      estado.productos = estado.productos.map((p) => (p.id_producto === actual.id_producto ? actualizado : p));
      return r.fulfill({ json: { ok: true, data: { product: actualizado } } });
    }
    return r.fulfill({ status: 405, json: { ok: false, error: { code: 'METODO', message: 'No' }, data: null } });
  });
});

const tarjeta = (page, nombre) => page.locator('#productos-lista article').filter({ hasText: nombre });
async function abrir(page) {
  await page.goto('/administracion/productos');
  await expect(page.locator('#productos-lista')).toBeVisible();
}

test('listado muestra nombre, Organización, país y estado de publicación', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await abrir(page);
  await expect(page.getByRole('link', { name: 'Productos de cotización', exact: true })).toBeVisible();
  const bolso = tarjeta(page, 'Bolso reutilizable tejido');
  for (const valor of ['Cooperativa Manos del Sur', 'Argentina', 'No publicado', 'Textil reciclado']) await expect(bolso).toContainText(valor);
  const caja = tarjeta(page, 'Caja organizadora modular');
  for (const valor of ['Comedor Solidario Las Palmas', 'Chile', 'Publicado']) await expect(caja).toContainText(valor);
  await expect(page.locator('#productos-total')).toHaveText('2');
  await expect(page.locator('#productos-publicados')).toHaveText('1');
  await page.locator('#productos-estado').selectOption('publicados');
  await expect(page.locator('#productos-lista article')).toHaveCount(1);
  await page.locator('#productos-estado').selectOption('todos');
  await page.locator('#productos-buscar').fill('argentina');
  await expect(page.locator('#productos-lista article')).toHaveCount(1);
  await page.locator('#productos-buscar').fill('zzz');
  await expect(page.locator('#productos-sin-resultados')).toBeVisible();
});

test('agregar producto: validación, Organización, atributos, vista previa e imágenes', async ({ page }) => {
  await abrir(page);
  await page.locator('#productos-nuevo').click();
  await expect(page.locator('#productos-form-titulo')).toHaveText('Nuevo producto');
  const peticiones = estado.requests.length;
  await page.locator('#productos-guardar').click();
  for (const campo of ['nombre', 'descripcion', 'unidad_medida', 'id_organizacion']) {
    await expect(page.locator(`#productos-error-${campo}`)).toBeVisible();
    await expect(page.locator(`#productos-${campo}`)).toHaveAttribute('aria-invalid', 'true');
  }
  await expect(page.locator('#productos-form-error')).toContainText('Revisa los campos');
  expect(estado.requests.length).toBe(peticiones);

  await page.locator('#productos-nombre').fill('Set de posavasos');
  await page.locator('#productos-descripcion').fill('Set de 6 unidades de corcho recuperado.');
  await page.locator('#productos-unidad_medida').fill('set');
  await page.locator('#productos-id_organizacion').selectOption(ORG_CL);
  await expect(page.locator('#productos-pais')).toHaveText('Chile');
  // Valores ya registrados se ofrecen para seleccionar; uno nuevo se registra escribiéndolo.
  await expect(page.locator('#productos-opciones-categoria option')).toHaveCount(2);
  await page.locator('#productos-categoria').fill('Textil');
  await page.locator('#productos-material').fill('Corcho recuperado');
  await page.locator('#productos-terminacion').fill('Bordes redondeados');

  await page.locator('#productos-imagenes').setInputFiles([
    { name: 'frente.png', mimeType: 'image/png', buffer: PNG },
    { name: 'lado.png', mimeType: 'image/png', buffer: PNG },
    { name: 'ficha.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF') },
  ]);
  await expect(page.locator('#productos-error-imagenes')).toContainText('ficha.pdf');
  await expect(page.locator('#productos-vista-previa img')).toHaveCount(2);
  await expect(page.getByAltText('Vista previa de frente.png')).toBeVisible();
  await page.getByRole('button', { name: 'Quitar lado.png' }).click();
  await expect(page.locator('#productos-vista-previa img')).toHaveCount(1);

  estado.delay = 400;
  await page.locator('#productos-guardar').click();
  await expect(page.locator('#productos-form-estado')).toHaveText('Guardando producto…');
  await expect(page.locator('#productos-guardar')).toBeDisabled();
  await expect(page.locator('#productos-confirmacion')).toContainText('Producto creado sin publicar correctamente. Se cargó 1 imagen.');
  await expect(page.locator('#productos-panel')).toBeHidden();

  const post = estado.requests.find((r) => r.method() === 'POST' && r.url().endsWith('/api/v1/products'));
  expect(post.postDataJSON()).toEqual({ id_organizacion: ORG_CL, nombre: 'Set de posavasos', descripcion: 'Set de 6 unidades de corcho recuperado.', unidad_medida: 'Set', categoria: 'Textil', material: 'Corcho recuperado', terminacion: 'Bordes redondeados', publicado: false });
  const imagenes = estado.requests.find((r) => r.url().endsWith('/prod-nuevo/images'));
  expect(imagenes.headers()['content-type']).toContain('multipart/form-data');
  expect(imagenes.postDataBuffer().toString('latin1')).toContain('filename="frente.png"');
  await expect(tarjeta(page, 'Set de posavasos')).toContainText('Chile');
});

test('si fallan las imágenes, el producto queda guardado y se informa el error', async ({ page }) => {
  estado.fallarImagenes = true;
  await abrir(page);
  await page.locator('#productos-nuevo').click();
  await page.locator('#productos-nombre').fill('Libreta artesanal');
  await page.locator('#productos-descripcion').fill('80 hojas.');
  await page.locator('#productos-unidad_medida').fill('unidad');
  await page.locator('#productos-id_organizacion').selectOption(ORG_AR);
  await page.locator('#productos-imagenes').setInputFiles({ name: 'libreta.webp', mimeType: 'image/webp', buffer: PNG });
  await page.locator('#productos-guardar').click();
  await expect(page.locator('#productos-form-error')).toContainText('El producto se guardó, pero no fue posible cargar las imágenes');
  await expect(page.locator('#productos-guardar')).toHaveText('Reintentar carga de imágenes');
  await expect(tarjeta(page, 'Libreta artesanal')).toBeVisible();
});

test('editar producto envía solo los cambios con la versión esperada', async ({ page }) => {
  await abrir(page);
  await tarjeta(page, 'Bolso reutilizable tejido').getByRole('button', { name: 'Editar' }).click();
  await expect(page.locator('#productos-form-titulo')).toHaveText('Editar «Bolso reutilizable tejido»');
  await expect(page.locator('#productos-nombre')).toHaveValue('Bolso reutilizable tejido');
  await expect(page.locator('#productos-id_organizacion')).toHaveValue(ORG_AR);
  await expect(page.locator('#productos-pais')).toHaveText('Argentina');
  await expect(page.locator('#productos-material')).toHaveValue('Textil reciclado');
  await page.locator('#productos-guardar').click();
  await expect(page.locator('#productos-form-error')).toContainText('No hay cambios');
  await page.locator('#productos-nombre').fill('Bolso tejido XL');
  await page.locator('#productos-terminacion').fill('');
  await page.locator('#productos-guardar').click();
  await expect(page.locator('#productos-confirmacion')).toContainText('Producto actualizado correctamente.');
  const patch = estado.requests.find((r) => r.method() === 'PATCH');
  expect(patch.url()).toContain('/api/v1/products/prod-1');
  expect(patch.postDataJSON()).toEqual({ version_esperada: 3, cambios: { nombre: 'Bolso tejido XL', terminacion: null } });
  await expect(tarjeta(page, 'Bolso tejido XL')).toBeVisible();
});

test('publicar y retirar del catálogo piden confirmación', async ({ page }) => {
  await abrir(page);
  const bolso = tarjeta(page, 'Bolso reutilizable tejido');
  await bolso.getByRole('button', { name: 'Publicar en catálogo' }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toBeVisible();
  await expect(dialogo).toContainText('¿Publicar en el catálogo?');
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toBeHidden();
  expect(estado.requests.filter((r) => r.method() === 'PATCH')).toHaveLength(0);

  await bolso.getByRole('button', { name: 'Publicar en catálogo' }).click();
  await dialogo.getByRole('button', { name: 'Sí, publicar' }).click();
  await expect(dialogo).toBeHidden();
  await expect(bolso).toContainText('Publicado');
  await expect(page.locator('#productos-confirmacion')).toContainText('ahora está publicado');
  expect(estado.requests.at(-1).postDataJSON()).toEqual({ version_esperada: 3, cambios: { publicado: true } });

  await tarjeta(page, 'Caja organizadora modular').getByRole('button', { name: 'Retirar del catálogo' }).click();
  await expect(dialogo).toContainText('dejará de estar visible');
  estado.error = true;
  await dialogo.getByRole('button', { name: 'Sí, retirar' }).click();
  await expect(page.locator('#productos-dialogo-error')).toContainText('todavía no está disponible');
  estado.error = false;
  await dialogo.getByRole('button', { name: 'Sí, retirar' }).click();
  await expect(dialogo).toBeHidden();
  await expect(tarjeta(page, 'Caja organizadora modular')).toContainText('No publicado');
});

test('carga, servicio ausente, reintento y listado vacío', async ({ page }) => {
  estado.error = true; estado.delay = 400;
  await page.goto('/administracion/productos');
  await expect(page.locator('#productos-cargando')).toBeVisible();
  await expect(page.locator('#productos-error')).toContainText('todavía no está disponible');
  estado.error = false; estado.productos = [];
  await page.locator('#productos-reintentar').click();
  await expect(page.locator('#productos-vacio')).toBeVisible();
  await expect(page.locator('#productos-total')).toHaveText('0');
});

test('errores de validación del servicio aparecen junto al campo', async ({ page }) => {
  await abrir(page);
  await page.route('**/api/v1/products', (r) => r.fulfill({ status: 422, json: { ok: false, error: { code: 'VALIDACION', message: 'Datos inválidos', fields: { nombre: ['Ya existe un producto con ese nombre en la Organización.'] } }, data: null } }));
  await page.locator('#productos-nuevo').click();
  await page.locator('#productos-nombre').fill('Bolso reutilizable tejido');
  await page.locator('#productos-descripcion').fill('Duplicado');
  await page.locator('#productos-unidad_medida').fill('unidad');
  await page.locator('#productos-id_organizacion').selectOption(ORG_AR);
  await page.locator('#productos-guardar').click();
  await expect(page.locator('#productos-error-nombre')).toHaveText('Ya existe un producto con ese nombre en la Organización.');
  await expect(page.locator('#productos-nombre')).toHaveAttribute('aria-invalid', 'true');
});

test('móvil: sin desborde horizontal y contenido tratado como texto', async ({ page }) => {
  estado.productos = [producto({ nombre: '<img src=x onerror=alert(1)>', descripcion: 'a'.repeat(300) })];
  await page.setViewportSize({ width: 390, height: 844 });
  await abrir(page);
  await expect(page.locator('#productos-lista img')).toHaveCount(0);
  await expect(page.locator('#productos-lista article')).toContainText('<img src=x');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#productos-nuevo').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/productos-mobile.png', fullPage: true });
});

test('Coordinador no consulta productos ni ve la sección', async ({ page }) => {
  estado.rol = 'COORD';
  await page.goto('/administracion/productos');
  await expect(page.locator('#unauthorized-message')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Productos de cotización', exact: true })).not.toBeVisible();
  expect(estado.requests).toHaveLength(0);
});
