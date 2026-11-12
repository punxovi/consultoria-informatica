import { test, expect } from '@playwright/test';

const idPais = '18000000-0000-4000-8000-000000000001';
const idOrg = '18000000-0000-4000-8000-000000000002';
const idPrograma = '18000000-0000-4000-8000-000000000003';
const pais = { id_pais: idPais, nombre: 'Chile', codigo_iso: 'CL' };
const datosOrg = {
  nombre: 'Comedor Los Aromos',
  nombre_representante: 'Ana Pérez',
  telefono: '912345678',
  correo: 'contacto@example.test',
  region_departamento: 'Región Metropolitana',
  comuna_municipio_ciudad: 'Santiago',
  direccion: 'Calle Uno 123',
  publico_objetivo: 'Familias del barrio.',
  descripcion_breve: 'Entrega alimentación a familias del sector.',
  numero_beneficiarios: '40',
};
const org = {
  ...datosOrg, id_organizacion: idOrg, id_pais: idPais, numero_beneficiarios: 40,
  tipo_organizacion: 'comedor_merendero', tipo_organizacion_otro: null, imagen: null,
  pais, version: 1, archived_at: null,
};
const programa = {
  id_programa: idPrograma, nombre: 'Alimentación', objetivo_general: 'Objetivo', objetivos_especificos: 'Específicos',
  descripcion: 'Contexto', referencias_ods: null, referencias_esg: null, componentes_linea_accion: null,
  resultados_esperados: null, version: 1, lineas_accion: [{ linea_accion: 'Línea', resultado_esperado: 'Resultado' }],
};

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: 'qa-admin', refresh_token: 'qa-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: '18000000-0000-4000-8000-000000000009', email: 'qa@example.test', user_metadata: {} } })));
  await context.route('http://127.0.0.1:54329/**', r => r.fulfill({ json: [{ codigo: 'ADMIN', alcance: 'global', id_pais: null }] }));
  await context.route('**/api/v1/auth/session', r => r.fulfill({ json: { ok: true, data: { authenticated: true, user: { id: idOrg } } } }));
  await context.route('**/api/v1/organizations**', r => {
    const path = new URL(r.request().url()).pathname;
    if (path.endsWith('/countries')) return r.fulfill({ json: { ok: true, data: { countries: [pais] } } });
    if (path.endsWith('/legal-record')) return r.fulfill({ json: { ok: true, data: { expediente: null } } });
    return r.fulfill({ json: { ok: true, data: { organization: org, organizations: [org] } } });
  });
  await context.route('**/api/v1/programs**', r => r.fulfill({ json: { ok: true, data: { program: programa, programs: [programa] } } }));
});

test('organizaciones marca todos los campos faltantes a la vez y confirma la creación', async ({ page }) => {
  await page.goto('/organizaciones/nueva');
  await expect(page.locator('#campos-organizacion')).toBeEnabled();
  await page.getByRole('button', { name: 'Crear organización' }).click();

  await expect(page.locator('#organizacion-error')).toHaveText('Revisa los campos indicados antes de guardar.');
  await expect(page.locator('#form-organizacion [aria-invalid="true"]')).toHaveCount(12);
  await expect(page.locator('#nombre-validacion')).toHaveText('El nombre es obligatorio.');
  await expect(page.locator('#id_pais-validacion')).toHaveText('Selecciona un país.');
  await expect(page.locator('#nombre')).toBeFocused();
  await page.locator('#nombre').fill(datosOrg.nombre);
  await expect(page.locator('#nombre')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('#nombre-validacion')).toHaveCount(0);
  await expect(page.locator('#form-organizacion [aria-invalid="true"]')).toHaveCount(11);

  for (const [campo, valor] of Object.entries(datosOrg)) await page.locator(`#${campo}`).fill(valor);
  await page.locator('#id_pais').selectOption(idPais);
  await page.locator('#tipo_organizacion').selectOption('comedor_merendero');
  await page.getByRole('button', { name: 'Crear organización' }).click();
  await expect(page).toHaveURL(new RegExp(`/organizaciones/${idOrg}$`));
  await expect(page.locator('#organizacion-confirmacion')).toHaveText('Organización creada correctamente.');
});

test('programas confirma "creado" al crear y "modificado" al editar', async ({ page }) => {
  await page.goto(`/programas/${idPrograma}?resultado=creado`);
  await expect(page.locator('#programa-confirmacion')).toHaveText('Programa creado correctamente.');
  await page.goto(`/programas/${idPrograma}?resultado=guardado`);
  await expect(page.locator('#programa-confirmacion')).toHaveText('Programa modificado correctamente.');
});
