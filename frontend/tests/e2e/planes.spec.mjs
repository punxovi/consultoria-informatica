import { test, expect } from '@playwright/test';
import { stringify } from 'devalue';

// Pruebas de interfaz: las respuestas de Actions están simuladas, sin tocar Supabase.
const id = '17600000-0000-4000-8000-000000000001';
const datos = {
  id_organizacion: id, id_programa: id, nombre: 'Plan comunitario',
  responsable_nombre: 'Responsable de prueba', fecha_inicio: '2026-10-01', fecha_termino: '2026-12-30',
  situacion_necesidad: 'Necesidad detectada', objetivo_general: 'Fortalecer la comunidad',
  objetivos_especificos: 'Realizar talleres', resultado_esperado: 'Participantes capacitados',
};
let plan, solicitudes, fallo;
test.beforeEach(async ({ context }) => {
  plan = { ...datos, id_plan: id, version: 3, organizacion: { id, nombre: 'Organización de prueba' }, programa: { id, nombre: 'Programa de prueba' } };
  solicitudes = []; fallo = '';
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({
    access_token: 'qa-admin', refresh_token: 'qa-refresh', expires_at: Math.floor(Date.now()/1000)+3600,
    token_type: 'bearer', user: { id: '17600000-0000-4000-8000-000000000001', email: 'qa@example.test', user_metadata: {} },
  })));
  await context.route('**/_actions/**', async route => {
    const nombre = new URL(route.request().url()).pathname.split('/').filter(Boolean).pop();
    const entrada = route.request().postDataJSON();
    solicitudes.push({ nombre, entrada });
    if (fallo && ['actualizarPlan', 'obtenerPlanPorId'].includes(nombre)) {
      await route.fulfill({ contentType: 'application/json+devalue', body: stringify({ ok: false, codigo: fallo, mensaje: 'El plan fue modificado por otra sesión. Recarga los datos antes de guardar.', datos: null }) }); return;
    }
    if (nombre === 'actualizarPlan') plan = { ...plan, ...entrada.cambios, version: plan.version + 1 };
    const respuesta = nombre === 'listarOrganizaciones' ? [{ id_organizacion: id, nombre: 'Organización de prueba' }]
      : nombre === 'listarProgramas' ? [{ id_programa: id, nombre: 'Programa de prueba' }]
      : nombre === 'listarPlanes' ? [plan] : plan;
    await route.fulfill({ contentType: 'application/json+devalue', body: stringify({ ok: true, datos: respuesta }) });
  });
});

test('valida creación, guarda sin acciones y confirma en el listado', async ({ page }) => {
  await page.goto('/planes/nuevo');
  await expect(page.locator('#guardar-plan')).toBeEnabled();
  await page.getByRole('button', { name: 'Guardar plan' }).click();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(10);
  for (const [campo, valor] of Object.entries(datos)) {
    if (campo.startsWith('id_')) await page.locator(`#${campo}`).selectOption(valor);
    else await page.locator(`#${campo}`).fill(valor);
  }
  await page.locator('#fecha_termino').fill('2026-09-01');
  await page.getByRole('button', { name: 'Guardar plan' }).click();
  await expect(page.locator('#fecha_termino')).toHaveAttribute('aria-invalid', 'true');
  expect(solicitudes.filter(s => s.nombre === 'crearPlan')).toHaveLength(0);
  await page.locator('#fecha_termino').fill(datos.fecha_termino);
  await page.getByRole('button', { name: 'Guardar plan' }).click();
  await expect(page.locator('#plan-confirmacion')).toHaveText('Plan guardado correctamente.');
  expect(solicitudes.find(s => s.nombre === 'crearPlan').entrada).toEqual(datos);
});

test('edita datos precargados con versión y conserva cambios ante conflicto', async ({ page }) => {
  await page.goto(`/planes/${id}`);
  await page.getByRole('link', { name: 'Editar plan' }).click();
  await expect(page.locator('#nombre')).toHaveValue(datos.nombre);
  await page.locator('#nombre').fill('Plan actualizado');
  fallo = 'CONFLICTO_CONCURRENCIA';
  await page.getByRole('button', { name: 'Guardar plan' }).click();
  await expect(page.locator('#plan-errores')).toBeVisible();
  await expect(page.locator('#nombre')).toHaveValue('Plan actualizado');
  await expect(page.locator('#guardar-plan')).toBeDisabled();
  fallo = '';
  await page.getByRole('button', { name: 'Reintentar carga' }).click();
  await expect(page.locator('#nombre')).toHaveValue(datos.nombre);
  await page.locator('#nombre').fill('Plan actualizado');
  await page.getByRole('button', { name: 'Guardar plan' }).click();
  await expect(page.locator('#plan-confirmacion')).toBeVisible();
  expect(solicitudes.filter(s => s.nombre === 'actualizarPlan').at(-1).entrada.version_esperada).toBe(3);
  await page.goto(`/planes/${id}/editar`);
  await expect(page.locator('#nombre')).toHaveValue('Plan actualizado');
  await page.getByRole('link', { name: 'Cancelar', exact: true }).click();
  await expect(page).toHaveURL(/\/planes$/);
});

test('carga fallida permite reintentar y el formulario cabe en móvil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  fallo = 'ERROR_BASE_DATOS';
  await page.goto(`/planes/${id}/editar`);
  await expect(page.locator('#plan-errores')).toBeVisible();
  await expect(page.locator('#guardar-plan')).toBeDisabled();
  fallo = '';
  await page.getByRole('button', { name: 'Reintentar carga' }).click();
  await expect(page.locator('#nombre')).toHaveValue(datos.nombre);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
