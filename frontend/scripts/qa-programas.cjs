const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');

(async () => {
  const { stringify } = await import('devalue');
  const env = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
  const url = env.match(/^PUBLIC_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1];
  const storageKey = `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
  const id = '11111111-1111-4111-8111-111111111111';
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await context.addInitScript(({ storageKey }) => {
    localStorage.setItem(storageKey, JSON.stringify({ access_token: 'test-token', refresh_token: 'test-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '11111111-1111-4111-8111-111111111111', email: 'prueba@example.test', user_metadata: {} } }));
  }, { storageKey });
  let programa = null;
  let creaciones = 0, ediciones = 0, fallarImagen = false, subidas = 0, archivos = 0;
  let rol = 'ADMIN', falloArchivo = false;
  const fallos = [];
  await context.route(`${url}/**`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/rpc/get_user_roles')) return route.fulfill({ json: [{ codigo: rol, alcance: 'global', id_pais: null }] });
    if (pathname.includes('/storage/v1/object/') && route.request().method() === 'POST') {
      subidas++;
      return route.fulfill({ status: fallarImagen ? 500 : 200, json: fallarImagen ? { message: 'Fallo simulado' } : { Key: 'ok' } });
    }
    if (pathname.endsWith('/archivos')) return route.fulfill({ json: route.request().method() === 'GET' ? null : {} });
    return route.fulfill({ json: [] });
  });
  await context.route('**/_actions/**', async route => {
    assert.equal(route.request().headers().authorization, 'Bearer test-token');
    const action = new URL(route.request().url()).pathname.split('/').filter(Boolean).pop();
    const data = route.request().postDataJSON();
    let datos;
    if (action === 'crearPrograma') {
      creaciones++;
      programa = { ...data, id_programa: id, version: 1 }; datos = programa;
    } else if (action === 'actualizarPrograma') {
      assert.equal(data.version_esperada, programa.version);
      ediciones++;
      programa = { ...programa, ...data.cambios, version: programa.version + 1 }; datos = programa;
    } else if (action === 'obtenerProgramaPorId') datos = programa;
    else if (action === 'listarProgramas') datos = programa.archived_at ? [] : [programa];
    else if (action === 'archivarPrograma') {
      archivos++;
      assert.equal(data.version_esperada, programa.version);
      if (falloArchivo) return route.fulfill({ contentType: 'application/json+devalue', body: stringify({ ok: false, codigo: 'CONFLICTO_CONCURRENCIA', mensaje: 'Recarga la página.', datos: null }) });
      programa.archived_at = new Date().toISOString(); datos = programa;
    }
    else throw new Error(action);
    await route.fulfill({ contentType: 'application/json+devalue', body: stringify({ ok: true, datos, mensaje: 'OK', codigo: 'PROGRAMA_CREADO' }) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => fallos.push(error.message));
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:4322') + '/programas/nuevo');
  await page.locator('#programa-campos').waitFor();
  await page.waitForFunction(() => !document.querySelector('#programa-campos').disabled);
  await page.locator('#guardar-programa').click();
  assert.equal(creaciones, 0);
  assert.ok(await page.locator('[aria-invalid="true"]').count() >= 6);
  for (const [campo, texto] of Object.entries({ nombre: 'Programa de prueba', objetivo_general: 'Fortalecer organizaciones', objetivos_especificos: 'Capacitar equipos', descripcion: 'Contexto del programa', referencias_ods: 'ODS 4', referencias_esg: 'Social' })) await page.locator(`#${campo}`).fill(texto);
  await page.locator('[data-campo="linea_accion"]').fill('Formación');
  await page.locator('[data-campo="resultado_esperado"]').fill('Equipos formados');
  await page.locator('#agregar-linea').click();
  await page.locator('[data-campo="linea_accion"]').nth(1).fill('Formación');
  await page.locator('[data-campo="resultado_esperado"]').nth(1).fill('Otro resultado');
  await page.locator('#guardar-programa').click();
  assert.equal(creaciones, 0);
  assert.ok((await page.locator('[data-error-campo]').allTextContents()).some(t => t.includes('repetida')));
  await page.locator('[data-campo="linea_accion"]').nth(1).fill('Acompañamiento');
  const png = await page.screenshot();
  await page.locator('#imagen').setInputFiles({ name: 'prueba.png', mimeType: 'image/png', buffer: png });
  await page.waitForFunction(() => document.querySelector('#programa-estado').textContent.includes('Imagen lista'));
  await page.evaluate(() => document.querySelector('#main-content').scrollTop = 0);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#main-content')).opacity === '1');
  await page.screenshot({ path: path.join(process.env.QA_OUTPUT || '.', 'formulario-movil.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  fallarImagen = true;
  await page.locator('#guardar-programa').click();
  await page.waitForFunction(() => document.querySelector('#programa-errores').textContent.includes('imagen no se pudo subir'));
  assert.equal(creaciones, 1);
  fallarImagen = false;
  await page.locator('#guardar-programa').click();
  await page.locator('#programa-confirmacion').filter({ hasText: 'guardado correctamente' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/programas');
  assert.equal(creaciones, 1); assert.equal(ediciones, 1); assert.equal(subidas, 2);
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:4322') + `/programas/${id}/editar`);
  await page.waitForFunction(() => !document.querySelector('#programa-campos').disabled);
  assert.equal(await page.locator('#nombre').inputValue(), 'Programa de prueba');
  assert.equal(await page.locator('#referencias_ods').inputValue(), 'ODS 4');
  assert.equal(await page.locator('[data-campo="linea_accion"]').count(), 2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#main-content')).opacity === '1');
  await page.screenshot({ path: path.join(process.env.QA_OUTPUT || '.', 'formulario-escritorio.png'), fullPage: true });
  await page.locator('#guardar-programa').click();
  await page.locator('#programa-confirmacion').filter({ hasText: 'guardado correctamente' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/programas');
  await page.getByRole('link', { name: 'Ver detalle' }).click();
  await page.getByRole('heading', { name: 'Programa de prueba' }).waitFor();
  assert.equal(await page.locator('#detalle-lineas dt').count(), 2);
  await page.locator('#eliminar-programa').waitFor({ state: 'visible' });
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#eliminar-programa').click();
  assert.equal(archivos, 0);
  falloArchivo = true;
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#eliminar-programa').click();
  await page.waitForFunction(() => document.querySelector('#eliminar-estado').textContent.includes('Recarga'));
  assert.equal(await page.locator('#eliminar-programa').isEnabled(), true);
  falloArchivo = false;
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#eliminar-programa').click();
  await page.locator('#programa-confirmacion').filter({ hasText: 'Programa eliminado' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/programas');
  assert.equal(programa.lineas_accion.length, 2);
  await page.getByText('No hay programas registrados.').waitFor();
  programa.archived_at = null;
  rol = 'COORD';
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:4322') + `/programas/${id}`);
  await page.getByRole('heading', { name: 'Programa de prueba' }).waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#main-content')).opacity === '1');
  assert.equal(await page.locator('#eliminar-programa-panel').isVisible(), false);
  rol = 'ADMIN';
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:4322') + '/programas/nuevo');
  await page.waitForFunction(() => !document.querySelector('#programa-campos').disabled);
  for (const campo of ['nombre', 'objetivo_general', 'objetivos_especificos', 'descripcion']) await page.locator(`#${campo}`).fill('Prueba de creación y retorno');
  await page.locator('[data-campo="linea_accion"]').fill('Capacitación');
  await page.locator('[data-campo="resultado_esperado"]').fill('Equipo capacitado');
  await page.locator('#guardar-programa').click();
  await page.locator('#programa-confirmacion').filter({ hasText: 'guardado correctamente' }).waitFor();
  assert.equal(new URL(page.url()).pathname, '/programas');
  assert.deepEqual(fallos, []);
  console.log('OK: formulario, imagen, navegación; eliminación con confirmación/cancelación, error recuperable, exclusión del catálogo y botón oculto a COORD. Backend simulado.');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });


