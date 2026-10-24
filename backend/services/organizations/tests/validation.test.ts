import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ServiceError } from '../../../shared/errors/src/index.ts';
import {
  parseOrganizationFields,
  parseOrganizationFilters,
  parseUpdateInput,
} from '../src/domain/organizations.ts';

const valid = {
  id_pais: '11111111-1111-4111-8111-111111111111',
  nombre: ' Organización Uno ',
  nombre_representante: 'Representante',
  telefono: '+56 9 1234 5678',
  correo: 'CONTACTO@EJEMPLO.CL',
  region_departamento: 'Metropolitana',
  comuna_municipio_ciudad: 'Santiago',
  direccion: 'Calle 123',
  publico_objetivo: 'Personas mayores',
  descripcion_breve: 'Apoyo comunitario',
  tipo_organizacion: 'centro_comunitario',
  tipo_organizacion_otro: null,
  numero_beneficiarios: 50,
};

describe('validaciones de Organizaciones', () => {
  test('normaliza todos los campos de creación', () => {
    const result = parseOrganizationFields(valid);
    assert.equal(result.nombre, 'Organización Uno');
    assert.equal(result.correo, 'contacto@ejemplo.cl');
  });

  test('rechaza propiedades adicionales, teléfonos largos y tipo otra incompleto', () => {
    for (const input of [
      { ...valid, extra: true },
      { ...valid, telefono: '1234567890123456' },
      { ...valid, tipo_organizacion: 'otra', tipo_organizacion_otro: null },
    ]) {
      assert.throws(
        () => parseOrganizationFields(input),
        (error) => error instanceof ServiceError && error.code === 'DATOS_INVALIDOS',
      );
    }
  });

  test('valida actualizaciones y control de versión', () => {
    assert.deepEqual(parseUpdateInput({ version_esperada: 2, cambios: { nombre: 'Nuevo nombre' } }), {
      expectedVersion: 2,
      changes: { nombre: 'Nuevo nombre' },
    });
    assert.throws(() => parseUpdateInput({ cambios: {} }), ServiceError);
    assert.throws(() => parseUpdateInput({ version_esperada: 0, cambios: { nombre: 'X' } }), ServiceError);
  });

  test('valida filtros HTTP', () => {
    assert.deepEqual(
      parseOrganizationFilters(new URL(
        'http://test/v1/organizations?search=comedores&id_pais=11111111-1111-4111-8111-111111111111&id_programa=22222222-2222-4222-8222-222222222222',
      )),
      {
        search: 'comedores',
        idPais: '11111111-1111-4111-8111-111111111111',
        idPrograma: '22222222-2222-4222-8222-222222222222',
        includeArchived: false,
      },
    );
    assert.deepEqual(
      parseOrganizationFilters(new URL('http://test/v1/organizations?incluir_archivadas=true')),
      { includeArchived: true },
    );
    assert.throws(
      () => parseOrganizationFilters(new URL('http://test/v1/organizations?q=comedores')),
      ServiceError,
    );
    assert.throws(
      () => parseOrganizationFilters(new URL('http://test/v1/organizations?desconocido=1')),
      ServiceError,
    );
  });
});
