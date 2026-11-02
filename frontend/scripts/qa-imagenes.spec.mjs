// QA: UI y Actions reales; PostgreSQL embebido; transporte de archivos simulado.
// Desde frontend: npx playwright test --config scripts/qa-imagenes.config.mjs
import { test, expect } from '@playwright/test';

const origen = 'http://127.0.0.1:54329';

async function preparar(context) {
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({
    access_token: 'qa-admin', refresh_token: 'qa-refresh', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: '17600000-0000-4000-8000-000000000001', email: 'qa@example.test', user_metadata: {} },
  })));
  await context.route('**/api/v1/auth/session', route => route.fulfill({ json: {
    ok: true, code: 'SESION_VALIDA', message: 'Sesión de QA válida.',
    data: { authenticated: true, user: { id: '17600000-0000-4000-8000-000000000001', email: 'qa@example.test' } },
  } }));  const estado = {
    objetos: new Map(), archivos: [], subidas: [],
    fallarSubida: false, fallarRegistro: false, fallarConsulta: false,
    fallarRetiro: false, fallarLimpieza: false, eliminaciones: 0,
  };
  await context.route(`${origen}/rest/v1/archivos*`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'GET') {
      if (estado.fallarConsulta) return route.fulfill({ status: 503, json: { message: 'Fallo QA de consulta' } });
      const id = url.searchParams.get('id_programa')?.replace(/^eq\./, '');
      return route.fulfill({ json: estado.archivos.filter(a => a.id_programa === id && !a.archived_at).slice(-1) });
    }
    if (req.method() === 'PATCH') {
      if (estado.fallarRetiro) return route.fulfill({ status: 503, json: { message: 'Fallo QA de retiro' } });
      const id = url.searchParams.get('id_programa')?.replace(/^eq\./, '');
      const archivos = estado.archivos.filter(a => a.id_programa === id && !a.archived_at);
      for (const archivo of archivos) archivo.archived_at = req.postDataJSON().archived_at;
      return route.fulfill({ json: archivos.map(a => ({ id_archivo: a.id_archivo })) });
    }
    if (estado.fallarRegistro) return route.fulfill({ status: 503, json: { message: 'Fallo QA de registro' } });
    const archivo = req.postDataJSON();
    estado.archivos.push({ ...archivo, id_archivo: `qa-${estado.archivos.length}` });
    return route.fulfill({ status: 201, json: null });
  });
  await context.route(`${origen}/storage/v1/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const ruta = decodeURIComponent(url.pathname.split('/fge-archivos/')[1] || '');
    if (req.method() === 'DELETE') {
      estado.eliminaciones++;
      if (estado.fallarLimpieza) return route.fulfill({ status: 503, json: { message: 'Fallo QA limpieza' } });
      for (const prefix of req.postDataJSON().prefixes) estado.objetos.delete(prefix);
      return route.fulfill({ json: [] });
    }
    if (url.pathname.includes('/object/sign/') && req.method() === 'POST') {
      return route.fulfill({ json: { signedURL: `/object/sign/fge-archivos/${ruta}?token=qa` } });
    }
    if (req.method() === 'GET') {
      const bytes = estado.objetos.get(ruta);
      return bytes ? route.fulfill({ contentType: 'image/webp', body: bytes }) : route.fulfill({ status: 404, body: '' });
    }
    if (req.method() === 'POST') {
      const form = await new Request('http://localhost', {
        method: 'POST', headers: { 'content-type': req.headers()['content-type'] }, body: req.postDataBuffer(),
      }).formData();
      const archivo = [...form.values()].find(value => typeof value !== 'string');
      const bytes = Buffer.from(await archivo.arrayBuffer());
      estado.subidas.push({ ruta, bytes, mime: archivo.type });
      if (estado.fallarSubida) return route.fulfill({ status: 503, json: { message: 'Fallo QA de subida' } });
      estado.objetos.set(ruta, bytes);
      return route.fulfill({ json: { Key: `fge-archivos/${ruta}` } });
    }
    return route.fulfill({ status: 400, json: { message: 'Operación QA no implementada' } });
  });
  return estado;
}

async function nuevo(page, nombre) {
  await page.goto('/programas/nuevo');
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', false);
  for (const campo of ['nombre', 'descripcion', 'objetivo_general', 'objetivos_especificos']) {
    await page.locator(`#${campo}`).fill(campo === 'nombre' ? nombre : 'Texto para control de calidad');
  }
  await page.locator('[data-campo="linea_accion"]').fill('Formación');
  await page.locator('[data-campo="resultado_esperado"]').fill('Equipos capacitados');
}

async function imagen(page, mime, ruido = false) {
  const dataUrl = await page.evaluate(async ({ mime, ruido }) => {
    const canvas = document.createElement('canvas');
    canvas.width = ruido ? 2800 : 160;
    canvas.height = ruido ? 2000 : 90;
    const ctx = canvas.getContext('2d');
    if (ruido) {
      const datos = ctx.createImageData(canvas.width, canvas.height);
      let semilla = 23;
      for (let i = 0; i < datos.data.length; i += 4) {
        semilla = (Math.imul(semilla, 1664525) + 1013904223) >>> 0;
        datos.data[i] = semilla & 255;
        datos.data[i + 1] = (semilla >>> 8) & 255;
        datos.data[i + 2] = (semilla >>> 16) & 255;
        datos.data[i + 3] = 255;
      }
      ctx.putImageData(datos, 0, 0);
    } else { ctx.fillStyle = '#237854'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    return canvas.toDataURL(mime, 0.95);
  }, { mime, ruido });
  return { name: `qa.${mime.split('/')[1]}`, mimeType: mime, buffer: Buffer.from(dataUrl.split(',')[1], 'base64') };
}

async function seleccionar(page, archivo) {
  await page.locator('#imagen').setInputFiles(archivo);
  await expect(page.locator('#programa-estado')).toContainText('Imagen lista');
  await expect(page.locator('#imagen-preview')).toBeVisible();
}

for (const mime of ['image/jpeg', 'image/png', 'image/webp']) {
  test(`carga ${mime}, convierte bytes a WebP, asocia al programa y muestra al recargar`, async ({ page, context }) => {
    const storage = await preparar(context);
    await nuevo(page, `QA formato ${mime}`);
    await seleccionar(page, await imagen(page, mime));
    await page.locator('#guardar-programa').click();
    await expect(page.locator('#programa-confirmacion')).toBeVisible();
    const subida = storage.subidas[0];
    expect(subida.mime).toBe('image/webp');
    expect(subida.bytes.length).toBeLessThan(600000);
    expect(subida.bytes.toString('ascii', 0, 4)).toBe('RIFF');
    expect(subida.bytes.toString('ascii', 8, 12)).toBe('WEBP');
    const id = new URL(page.url()).pathname.split('/')[2];
    expect(storage.archivos[0]).toMatchObject({ id_programa: id, ruta_objeto: subida.ruta, tamano_bytes: subida.bytes.length });
    await page.reload();
    await expect(page.locator('#detalle-imagen')).toBeVisible();
    await expect.poll(() => page.locator('#detalle-imagen').evaluate(el => el.naturalWidth)).toBeGreaterThan(0);
  });
}

test('comprime imagen grande y detallada a menos de 600000 bytes', async ({ page, context }) => {
  await preparar(context);
  await nuevo(page, 'QA compresión');
  const archivo = await imagen(page, 'image/jpeg', true);
  expect(archivo.buffer.length).toBeGreaterThan(600000);
  expect(archivo.buffer.length).toBeLessThan(10 * 1024 * 1024);
  await seleccionar(page, archivo);
  const resultado = await page.locator('#imagen-preview').evaluate(async el => {
    const blob = await (await fetch(el.src)).blob();
    const bitmap = await createImageBitmap(blob);
    return { size: blob.size, type: blob.type, width: bitmap.width, height: bitmap.height };
  });
  expect(resultado.size).toBeLessThan(600000);
  expect(resultado.type).toBe('image/webp');
  expect(Math.max(resultado.width, resultado.height)).toBeLessThanOrEqual(2000);
  console.log('Compresión:', JSON.stringify({ entrada: archivo.buffer.length, ...resultado }));
});

for (const mime of ['image/gif', 'image/svg+xml', 'application/pdf']) {
  test(`rechaza ${mime} y bloquea guardado`, async ({ page, context }) => {
    const storage = await preparar(context);
    await nuevo(page, `QA rechazo ${mime}`);
    let creaciones = 0;
    page.on('request', req => { if (req.url().endsWith('/api/v1/programs') && req.method() === 'POST') creaciones++; });
    await page.locator('#imagen').setInputFiles({ name: 'archivo-invalido', mimeType: mime, buffer: Buffer.from('QA') });
    await expect(page.locator('#programa-errores')).toContainText('JPG, PNG o WebP');
    await page.locator('#guardar-programa').click();
    await expect(page.locator('#programa-errores')).toContainText('imagen válida');
    expect(creaciones).toBe(0);
    expect(storage.subidas).toHaveLength(0);
  });
}

test('rechaza PNG corrupto y archivo mayor a 10 MiB', async ({ page, context }) => {
  await preparar(context);
  await nuevo(page, 'QA entradas dañadas');
  await page.locator('#imagen').setInputFiles({ name: 'corrupto.png', mimeType: 'image/png', buffer: Buffer.from('no es una imagen') });
  await expect(page.locator('#programa-errores')).toContainText('No se pudo leer la imagen');
  await page.locator('#imagen').setInputFiles({ name: 'grande.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await expect(page.locator('#programa-errores')).toContainText('no puede superar 10 MB');
});

test('reintenta imagen fallida al crear sin duplicar el programa', async ({ page, context }) => {
  const storage = await preparar(context);
  await nuevo(page, 'QA reintento creación');
  await seleccionar(page, await imagen(page, 'image/png'));
  let creaciones = 0;
  page.on('request', req => { if (req.url().endsWith('/api/v1/programs') && req.method() === 'POST') creaciones++; });
  storage.fallarSubida = true;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-errores')).toContainText('imagen no se pudo subir');
  storage.fallarSubida = false;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-confirmacion')).toBeVisible();
  const respuesta = await page.request.get('http://127.0.0.1:4000/api/v1/programs', { headers: { Authorization: 'Bearer qa-admin' } });
  const datos = (await respuesta.json()).data.programs;
  const duplicados = datos.filter(p => p.nombre === 'QA reintento creación');
  console.log('Reintento creación:', JSON.stringify({ creaciones, programas: duplicados.map(p => p.id_programa) }));
  expect(creaciones, 'El segundo intento debe reutilizar el programa creado').toBe(1);
  expect(duplicados).toHaveLength(1);
});

test('reintenta imagen fallida al editar usando la versión actualizada', async ({ page, context }) => {
  const storage = await preparar(context);
  await nuevo(page, 'QA reintento edición');
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-confirmacion')).toBeVisible();
  await page.goto(`${new URL(page.url()).pathname}/editar`);
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', false);
  const ediciones = [];
  page.on('request', req => { if (/\/api\/v1\/programs\/[^/]+$/.test(new URL(req.url()).pathname) && req.method() === 'PATCH') ediciones.push(req.postDataJSON()); });
  await seleccionar(page, await imagen(page, 'image/png'));
  storage.fallarSubida = true;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-errores')).toContainText('imagen no se pudo subir');
  storage.fallarSubida = false;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-confirmacion')).toBeVisible();
  expect(ediciones).toHaveLength(1);
  expect(storage.subidas).toHaveLength(2);
  expect(storage.archivos).toHaveLength(1);
});

test('limpia objeto subido si falla registrar la asociación', async ({ page, context }) => {
  const storage = await preparar(context);
  await nuevo(page, 'QA fallo metadatos');
  await seleccionar(page, await imagen(page, 'image/png'));
  storage.fallarRegistro = true;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-errores')).toContainText('no se pudo registrar la imagen');
  expect(storage.eliminaciones).toBe(1);
  expect(storage.objetos.size).toBe(0);
  expect(storage.archivos).toHaveLength(0);
});

test('muestra error de consulta de imagen en el detalle', async ({ page, context }) => {
  const storage = await preparar(context);
  await nuevo(page, 'QA error detalle');
  await seleccionar(page, await imagen(page, 'image/png'));
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#detalle-imagen')).toBeVisible();
  storage.fallarConsulta = true;
  await page.reload();
  await expect(page.locator('#detalle-contenido')).toBeVisible();
  await expect(page.locator('#detalle-imagen')).toBeHidden();
  // PostgREST reintenta lecturas 503 con espera de 1, 2 y 4 segundos.
  await expect(page.getByText(/No se pudo consultar la imagen|No se pudo cargar la imagen/)).toBeVisible({ timeout: 12000 });
  storage.fallarConsulta = false;
  await page.locator('#reintentar-imagen').click();
  await expect(page.locator('#detalle-imagen')).toBeVisible();
  await expect(page.locator('#detalle-imagen-recuperacion')).toBeHidden();
});

test('cambios de texto después de una subida fallida actualizan el mismo programa', async ({ page, context }) => {
  const storage = await preparar(context);
  await nuevo(page, 'QA creación parcial');
  await seleccionar(page, await imagen(page, 'image/png'));
  storage.fallarSubida = true;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-errores')).toContainText('imagen no se pudo subir');
  const id = await page.locator('#programa-form').getAttribute('data-id');
  expect(new URL(page.url()).pathname).toBe(`/programas/${id}/editar`);
  await page.locator('#nombre').fill('QA creación parcial corregida');
  await page.locator('[data-campo="resultado_esperado"]').fill('Resultado corregido');
  storage.fallarSubida = false;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#detalle-nombre')).toHaveText('QA creación parcial corregida');
  await expect(page.locator('#detalle-lineas dd')).toHaveText(['Resultado corregido']);
  expect(new URL(page.url()).pathname).toBe(`/programas/${id}`);
  expect(storage.archivos[0].id_programa).toBe(id);
});

test('quitar imagen permite reintentar sin conflicto de versión', async ({ page, context }) => {
  const storage = await preparar(context);
  await nuevo(page, 'QA retiro parcial');
  await seleccionar(page, await imagen(page, 'image/png'));
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#detalle-imagen')).toBeVisible();
  await page.goto(`${new URL(page.url()).pathname}/editar`);
  await expect(page.locator('#imagen-preview')).toBeVisible();
  await page.locator('#quitar-imagen').click();
  storage.fallarRetiro = true;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-errores')).toContainText('no se pudo quitar la imagen');
  storage.fallarRetiro = false;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-confirmacion')).toBeVisible();
  await expect(page.locator('#detalle-imagen')).toBeHidden();
  expect(storage.archivos.every(a => a.archived_at)).toBe(true);
});

test('recargar tras un conflicto descarta también la imagen seleccionada', async ({ page, context }) => {
  const storage = await preparar(context);
  await nuevo(page, 'QA descartar imagen');
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-confirmacion')).toBeVisible();
  const ruta = new URL(page.url()).pathname;
  await page.goto(`${ruta}/editar`);
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', false);
  await seleccionar(page, await imagen(page, 'image/png'));
  const respuesta = await page.request.patch(`http://127.0.0.1:4000/api/v1/programs/${ruta.split('/')[2]}`, {
    headers: { Authorization: 'Bearer qa-admin' },
    data: { version_esperada: 1, cambios: { nombre: 'Cambio de otra sesión' } },
  });
  expect((await respuesta.json()).ok).toBe(true);
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-errores')).toContainText('otra sesión');
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#recargar-programa').click();
  await expect(page.locator('#nombre')).toHaveValue('Cambio de otra sesión');
  await expect(page.locator('#imagen')).toHaveValue('');
  await expect(page.locator('#imagen-preview')).toBeHidden();
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-confirmacion')).toBeVisible();
  expect(storage.subidas).toHaveLength(0);
});

test('un programa legado con líneas recién guardadas exige conservar al menos una tras el fallo de imagen', async ({ page, context }) => {
  const storage = await preparar(context);
  await page.goto('/programas');
  const enlace = page.getByRole('link', { name: 'Ver detalle de Donación de Recursos a Organizaciones Comunitarias', exact: true });
  await expect(enlace).toBeVisible();
  await page.goto(`${await enlace.getAttribute('href')}/editar`);
  await expect(page.locator('#programa-campos')).toHaveJSProperty('disabled', false);
  await expect(page.locator('[data-campo="linea_accion"]')).toHaveCount(0);
  await page.locator('#agregar-linea').click();
  await page.locator('[data-campo="linea_accion"]').fill('Línea incorporada al programa');
  await page.locator('[data-campo="resultado_esperado"]').fill('Resultado incorporado');
  await seleccionar(page, await imagen(page, 'image/png'));
  storage.fallarSubida = true;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#programa-errores')).toContainText('imagen no se pudo subir');
  await expect(page.locator('[data-quitar]')).toBeDisabled();
  storage.fallarSubida = false;
  await page.locator('#guardar-programa').click();
  await expect(page.locator('#detalle-lineas dt')).toHaveText(['Línea incorporada al programa']);
});
