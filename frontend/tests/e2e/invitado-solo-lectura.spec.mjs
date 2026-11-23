import { test, expect } from '@playwright/test';
const id = '17600000-0000-4000-8000-000000000001';
const pais = { id_pais: id, nombre: 'Chile', codigo_iso: 'CL' };
const org = { id_organizacion: id, id_pais: id, nombre: 'Comedor Las Palmas', region_departamento: 'RM', comuna_municipio_ciudad: 'Santiago', publico_objetivo: 'Familias', descripcion_breve: 'Comedor comunitario.', tipo_organizacion: 'comedor', numero_beneficiarios: 40, pais, archived_at: null, version: 1 };
let rol;
test.beforeEach(async ({ context }) => {
  rol = 'INVIT';
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'qa', refresh_token: 'qa', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '17600000-0000-4000-8000-000000000009', email: 'invitado@example.test', user_metadata: {} } })));
  await context.addCookies([{ name: 'fge_access_token', value: 'qa', url: 'http://127.0.0.1:4331' }]);
  const roles = () => [{ codigo: rol, alcance: 'global', id_pais: null }];
  await context.route('http://127.0.0.1:54329/**', r => r.fulfill({ json: roles() }));
  await context.route('**/rest/v1/rpc/get_user_roles', r => r.fulfill({ json: roles() }));
  await context.route('**/auth/v1/user', r => r.fulfill({ json: { id: '17600000-0000-4000-8000-000000000009', email: 'invitado@example.test' } }));
  await context.route('**/api/v1/auth/session', r => r.fulfill({ json: { ok: true, data: { authenticated: true, user: { id } } } }));
  await context.route('**/api/v1/programs', r => r.fulfill({ json: { ok: true, data: { programs: [] } } }));
  await context.route('**/api/v1/organizations**', r => {
    const path = new URL(r.request().url()).pathname;
    const data = path.endsWith('/countries') ? { countries: [pais] } : path.endsWith('/organizations') ? { organizations: [org] } : { organization: org };
    return r.fulfill({ json: { ok: true, data } });
  });
});
const soloLectura = page => expect(page.locator('html')).toHaveAttribute('data-solo-lectura', '');
test('Invitado consulta Organizaciones sin opciones de gestión', async ({ page }) => {
  await page.goto('/organizaciones');
  await expect(page.locator('#unauthorized-message')).toBeHidden();
  await expect(page.locator('#organizaciones-lista')).toContainText('Comedor Las Palmas');
  await soloLectura(page);
  await expect(page.getByRole('link', { name: /Nueva organización/ })).toBeHidden();
  await expect(page.locator('#filtro-pais option', { hasText: 'Chile' })).toHaveCount(1);
});
test('Invitado entra a la ficha y consulta todas las secciones de contenido', async ({ page }) => {
  await page.goto(`/organizaciones/${id}`);
  await expect(page.locator('#unauthorized-message')).toBeHidden();
  await soloLectura(page);
  await expect(page.getByRole('link', { name: /Editar organización/ })).toBeHidden();
  for (const seccion of ['actas', 'compromisos', 'diagnostico', 'donaciones', 'expediente-legal']) {
    await expect(page.locator(`[data-org-seccion="${seccion}"]`)).toBeVisible();
  }
});
test('Invitado abre Inicio, Planes, Programas y Reportes, pero no la administración', async ({ page }) => {
  for (const ruta of ['/dashboard', '/planes', '/programas', '/reportes/nuevo']) {
    await page.goto(ruta);
    await expect(page.locator('#main-content')).toHaveCSS('opacity', '1');
    await expect(page.locator('#unauthorized-message'), ruta).toBeHidden();
  }
  await page.goto('/planes');
  await expect(page.getByRole('link', { name: /Nuevo plan/ })).toBeHidden();
  for (const ruta of ['/administracion/auditoria', '/planes/nuevo', '/organizaciones/nueva', '/cotizaciones']) {
    await page.goto(ruta);
    await expect(page.locator('#unauthorized-message'), ruta).toBeVisible();
  }
});
test('Coordinador sigue viendo las opciones de gestión', async ({ page }) => {
  rol = 'COORD';
  await page.goto('/organizaciones');
  await expect(page.locator('#organizaciones-lista')).toContainText('Comedor Las Palmas');
  await expect(page.locator('html')).not.toHaveAttribute('data-solo-lectura', '');
  await expect(page.getByRole('link', { name: /Nueva organización/ })).toBeVisible();
});
