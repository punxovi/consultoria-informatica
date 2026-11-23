import { test, expect } from '@playwright/test';

const ORG = '12600000-0000-4000-8000-000000000001';
const PAIS = '12600000-0000-4000-8000-0000000000a1';
const OTRO_PAIS = '12600000-0000-4000-8000-0000000000a2';
const PROG_1 = '12600000-0000-4000-8000-0000000000b1';
const PROG_2 = '12600000-0000-4000-8000-0000000000b2';
const PLAN_1 = '12600000-0000-4000-8000-0000000000c1';
const PLAN_2 = '12600000-0000-4000-8000-0000000000c2';
const USUARIO = '12600000-0000-4000-8000-0000000000f1';

const organizacion = {
  id_organizacion: ORG, nombre: 'Centro Esperanza', id_pais: PAIS, pais: { id_pais: PAIS, nombre: 'Chile', codigo_iso: 'CL' },
  nombre_representante: 'Ana Pérez', correo: 'contacto@example.test', telefono: '+56 9 1234 5678',
  region_departamento: 'Valparaíso', comuna_municipio_ciudad: 'Viña del Mar', numero_beneficiarios: 120,
  archived_at: null, version: 1,
};
const plan = (id_plan, id_programa, nombre, programa) => ({
  id_plan, id_organizacion: ORG, id_programa, nombre, periodo_anual: 2026, version: 1,
  responsable_nombre: 'Ana Pérez', fecha_inicio: '2026-01-01', fecha_termino: '2026-12-31',
  situacion_necesidad: 'Necesidad', objetivo_general: 'Objetivo', objetivos_especificos: 'Específicos', resultado_esperado: 'Resultado',
  organizacion: { id: ORG, nombre: organizacion.nombre, id_pais: PAIS }, programa: { id: id_programa, nombre: programa },
});
const planes = [
  plan(PLAN_1, PROG_1, 'Plan alimentación 2026', 'Programa Alimentación'),
  plan(PLAN_2, PROG_2, 'Plan educación 2026', 'Programa Educación'),
];

let roles;
test.beforeEach(async ({ context }) => {
  roles = [{ codigo: 'ADMIN', alcance: 'global', id_pais: null }];
  await context.addInitScript((id) => localStorage.setItem('sb-127-auth-token', JSON.stringify({
    access_token: 'qa-token', refresh_token: 'qa-refresh', token_type: 'bearer',
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id, email: 'qa@example.test', user_metadata: {} },
  })), USUARIO);
  await context.route('http://127.0.0.1:54329/**', (r) => r.fulfill({ json: roles }));
  await context.route('**/api/v1/**', (r) => r.fulfill({ status: 404, json: { ok: false, error: { code: 'QA_NO_SIMULADO', message: 'No simulado.' } } }));
  const ok = (data) => ({ json: { ok: true, code: 'QA_OK', message: 'Simulado.', data } });
  await context.route('**/api/v1/auth/session', (r) => r.fulfill(ok({ authenticated: true, user: { id: USUARIO, email: 'qa@example.test' } })));
  await context.route('**/api/v1/organizations/temporary-coverages/mine', (r) => r.fulfill(ok({ coverages: [] })));
  await context.route(`**/api/v1/organizations/${ORG}`, (r) => r.fulfill(ok({ organization: organizacion })));
  await context.route(/\/api\/v1\/organizations(\?.*)?$/, (r) => r.fulfill(ok({ organizations: [organizacion] })));
  await context.route(/\/api\/v1\/plans(\?.*)?$/, (r) => r.fulfill(ok({ plans: planes })));
  await context.route(/\/api\/v1\/plans\/[^/?]+$/, (r) => {
    const id = new URL(r.request().url()).pathname.split('/').pop();
    const encontrado = planes.find((p) => p.id_plan === id);
    return encontrado ? r.fulfill(ok({ plan: encontrado })) : r.fulfill({ status: 404, json: { ok: false, error: { code: 'NO_ENCONTRADO', message: 'No existe.' } } });
  });
});

const parametros = (href) => Object.fromEntries(new URL(href, 'http://x').searchParams);

test('Organización con varios Planes: contexto, enlaces con IDs correctos y retorno con filtros originales', async ({ page }) => {
  await page.goto(`/organizaciones/${ORG}?q=esperanza&id_pais=${PAIS}`);
  await expect(page.locator('#breadcrumb-organizacion')).toHaveText('Centro Esperanza');
  await expect(page.locator('#breadcrumb-pais')).toHaveText('Chile');

  await page.getByRole('tab', { name: 'Intervenciones' }).click();
  const accesoPlanes = page.locator('#tab-intervenciones a', { hasText: 'Planes de Intervención' });
  expect(parametros(await accesoPlanes.getAttribute('href'))).toEqual({ id_organizacion: ORG, org_q: 'esperanza', org_pais: PAIS });
  await accesoPlanes.click();
  await expect(page).toHaveURL(/\/planes\?/);

  const tarjetas = page.locator('[data-detalle]');
  await expect(tarjetas).toHaveCount(2);
  const programas = page.locator('[data-programa]');
  await expect(programas).toHaveText(['Programa Alimentación', 'Programa Educación']);
  await expect(programas.nth(0)).toHaveAttribute('href', `/programas/${PROG_1}`);
  await expect(programas.nth(1)).toHaveAttribute('href', `/programas/${PROG_2}`);
  for (const enlace of await page.locator('[data-organizacion]').all()) {
    await expect(enlace).toHaveText('Centro Esperanza');
    expect(await enlace.getAttribute('href')).toBe(`/organizaciones/${ORG}?q=esperanza&id_pais=${PAIS}`);
  }

  await tarjetas.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/planes/${PLAN_2}\\?`));
  await expect(page.locator('#plan-breadcrumb')).toHaveText('Plan educación 2026');
  await expect(page.locator('[data-plan="programa"]').first()).toHaveAttribute('href', `/programas/${PROG_2}`);
  const migaOrganizacion = page.locator('#plan-organizacion-breadcrumb');
  await expect(migaOrganizacion).toHaveText('Centro Esperanza');
  await expect(migaOrganizacion).toHaveAttribute('href', `/organizaciones/${ORG}?q=esperanza&id_pais=${PAIS}`);
  const volverPlanes = page.locator('header a', { hasText: 'Planes de Intervención' }).first();
  expect(parametros(await volverPlanes.getAttribute('href'))).toMatchObject({ id_organizacion: ORG, org_q: 'esperanza', org_pais: PAIS });

  await migaOrganizacion.click();
  await expect(page.locator('#breadcrumb-organizacion')).toHaveText('Centro Esperanza');
  await expect(page.locator('header a', { hasText: 'Organizaciones' }).first()).toHaveAttribute('href', `/organizaciones?q=esperanza&id_pais=${PAIS}`);
});

test('Organización con un Plan filtrado por Programa conserva el Programa como contexto', async ({ page }) => {
  await page.goto(`/organizaciones/${ORG}?id_programa=${PROG_1}`);
  await page.getByRole('tab', { name: 'Intervenciones' }).click();
  await page.locator('#tab-intervenciones a', { hasText: 'Planes de Intervención' }).click();
  await expect(page.locator('[data-detalle]')).toHaveCount(1);
  await expect(page.locator('[data-programa]')).toHaveText('Programa Alimentación');
  await expect(page.locator('[data-organizacion]')).toHaveAttribute('href', `/organizaciones/${ORG}?id_programa=${PROG_1}`);
});

test('pestañas: ARIA coherente, teclado y fragmentos de URL seguros', async ({ page }) => {
  await page.goto(`/organizaciones/${ORG}`);
  await expect(page.locator('#breadcrumb-organizacion')).toHaveText('Centro Esperanza');

  const paneles = await page.locator('[role="tabpanel"]').evaluateAll((nodos) => nodos.map((n) => ({
    id: n.id, tab: document.getElementById(n.getAttribute('aria-labelledby') ?? '')?.getAttribute('aria-controls'),
  })));
  expect(paneles.length).toBe(3);
  for (const panel of paneles) expect(panel.tab).toBe(panel.id);
  for (const id of ['compromisos', 'expediente-legal', 'donaciones', 'diagnostico', 'actas']) {
    await expect(page.locator(`#tab-${id}`)).toHaveAttribute('role', 'region');
  }

  const informacion = page.getByRole('tab', { name: 'Información' });
  await informacion.focus();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: 'Seguimiento' })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(informacion).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Intervenciones' })).toHaveAttribute('aria-selected', 'true');

  await page.goto(`/organizaciones/${ORG}#donaciones`);
  await expect(page.locator('#tab-donaciones')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Seguimiento' })).toHaveAttribute('aria-selected', 'true');

  for (const fragmento of ['toString', 'constructor', '__proto__']) {
    await page.goto(`/organizaciones/${ORG}#${fragmento}`);
    await expect(page.locator('#tab-informacion')).toBeVisible();
    await expect(informacion).toHaveAttribute('aria-selected', 'true');
  }
});

test('Coordinador de otro país consulta la Organización en solo lectura', async ({ page }) => {
  roles = [{ codigo: 'COORD', alcance: 'pais', id_pais: OTRO_PAIS }];
  await page.goto(`/organizaciones/${ORG}`);
  await expect(page.locator('#breadcrumb-organizacion')).toHaveText('Centro Esperanza');
  await expect(page.locator('#ficha-organizacion')).toHaveAttribute('data-solo-lectura', '');
  await expect(page.locator('#gestion-organizacion')).toBeHidden();
});

test('móvil: la navegación contextual cabe sin desborde horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`/organizaciones/${ORG}?q=esperanza`);
  await expect(page.locator('#breadcrumb-organizacion')).toHaveText('Centro Esperanza');
  await page.getByRole('tab', { name: 'Intervenciones' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.locator('#tab-intervenciones a', { hasText: 'Planes de Intervención' }).click();
  await expect(page.locator('[data-detalle]')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
