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
  let creaciones = 0, ediciones = 0, fallarImagen = false, subidas = 0;
  const fallos = [];
  await context.route(`${url}/**`, async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/rpc/get_user_roles')) return route.fulfill({ json: [{ codigo: 'ADMIN', alcance: 'global', id_pais: null }] });
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
    else if (action === 'listarProgramas') datos = [programa];
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
  await page.waitForFunction(() => document.querySelector('#programa-estado').textContent.includes('guardado correctamente'));
  assert.equal(creaciones, 1); assert.equal(ediciones, 1); assert.equal(subidas, 2);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#programa-campos').disabled);
  assert.equal(await page.locator('#nombre').inputValue(), 'Programa de prueba');
  assert.equal(await page.locator('#referencias_ods').inputValue(), 'ODS 4');
  assert.equal(await page.locator('[data-campo="linea_accion"]').count(), 2);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#main-content')).opacity === '1');
  await page.screenshot({ path: path.join(process.env.QA_OUTPUT || '.', 'formulario-escritorio.png'), fullPage: true });
  await page.goto((process.env.BASE_URL || 'http://127.0.0.1:4322') + '/programas');
  await page.getByRole('link', { name: 'Ver detalle' }).click();
  await page.getByRole('heading', { name: 'Programa de prueba' }).waitFor();
  assert.equal(await page.locator('#detalle-lineas dt').count(), 2);
  assert.deepEqual(fallos, []);
  console.log('OK: obligatorios, duplicados, pares, Bearer, WebP, mobile sin desborde, crear/editar, recuperación tras fallo de imagen, precarga y navegación.');
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });


