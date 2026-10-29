import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGatewayServer } from '../../../backend/gateway/src/server.ts';
import { createOrganizationsServer } from '../../../backend/services/organizations/src/server.ts';
import { createCountriesApplication } from '../../../backend/services/organizations/src/application/countries-service.ts';
import { CountryError } from '../../../backend/services/organizations/src/domain/countries.ts';
import { crearClientePaises } from '../../src/lib/paises/cliente.ts';

const id = '15100000-0000-4000-8000-000000000001';
const initial = {
  id_pais: id,
  nombre: 'Chile',
  codigo_iso: 'CL',
  codigo_area_telefonica: '+56',
  zona_horaria: 'America/Santiago',
  version: 1,
  created_at: '2026-10-27T12:00:00.000Z',
  updated_at: '2026-10-27T12:00:00.000Z',
  configuracion_pendiente: false,
};

async function listen(server) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No se pudo iniciar el servidor de prueba.');
  return `http://127.0.0.1:${address.port}`;
}

test('Países: cliente HTTP → API Gateway → Backend transmite operaciones y autorización', async () => {
  let country = { ...initial };
  const operaciones = [];
  const application = createCountriesApplication({
    async execute(token, operation, input) {
      operaciones.push({ token, operation, input });
      if (token !== 'admin') throw new CountryError('SIN_PERMISO', 'Administrador requerido.', 403);
      if (operation === 'authorize') return { authorized: true };
      if (operation === 'list') return [country];
      if (operation === 'get') return country;
      if (operation === 'create') return { ...country, ...input, version: 1 };
      if (operation === 'update') {
        country = { ...country, ...input.cambios, version: country.version + 1 };
        return country;
      }
      throw new Error(`Operación inesperada: ${operation}`);
    },
  });
  const organizations = createOrganizationsServer(undefined, application);
  const organizationsUrl = await listen(organizations);
  const gateway = createGatewayServer({ targets: { organizations: new URL(organizationsUrl) } });
  const gatewayUrl = await listen(gateway);

  try {
    const client = crearClientePaises(gatewayUrl, async () => 'admin');
    assert.equal((await client.listar())[0].nombre, 'Chile');
    assert.equal((await client.crear({
      nombre: 'Perú', codigo_iso: 'PE', codigo_area_telefonica: '+51', zona_horaria: 'America/Lima',
    })).codigo_iso, 'PE');
    assert.equal((await client.actualizar(id, 1, { zona_horaria: 'America/Punta_Arenas' })).zona_horaria, 'America/Punta_Arenas');

    assert.deepEqual(operaciones.map(({ token, operation }) => ({ token, operation })), [
      { token: 'admin', operation: 'authorize' }, { token: 'admin', operation: 'list' },
      { token: 'admin', operation: 'authorize' }, { token: 'admin', operation: 'create' },
      { token: 'admin', operation: 'authorize' }, { token: 'admin', operation: 'update' },
    ]);

    const noAutorizado = crearClientePaises(gatewayUrl, async () => 'coord');
    await assert.rejects(noAutorizado.listar(), (error) => error?.status === 403 && error?.code === 'SIN_PERMISO');
  } finally {
    await new Promise((resolve) => gateway.close(resolve));
    await new Promise((resolve) => organizations.close(resolve));
  }
});
