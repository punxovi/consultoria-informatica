import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  actualizarOrganizacionSchema,
  formatearErroresOrganizacion,
  listarOrganizacionesSchema,
  organizacionSchema,
  obtenerOrganizacionPorIdSchema,
} from '../../src/actions/organizaciones/organizaciones.schema.ts';

const organizacionValida = {
  id_pais: '10000000-0000-4000-8000-000000000001',
  nombre: '  Organización Esperanza  ',
  nombre_representante: '  María Pérez  ',
  telefono: ' +56 9 1234 5678 ',
  correo: ' CONTACTO@EJEMPLO.CL ',
  region_departamento: '  Metropolitana  ',
  comuna_municipio_ciudad: '  Santiago  ',
  direccion: '  Avenida Principal 123  ',
  publico_objetivo: '  Familias de la comunidad  ',
  descripcion_breve: '  Organización comunitaria de prueba  ',
  tipo_organizacion: 'centro_comunitario',
  numero_beneficiarios: 120,
};

describe('schemas Zod de organizaciones', () => {
  it('acepta y normaliza una organización válida', () => {
    const resultado = organizacionSchema.parse(organizacionValida);

    assert.equal(resultado.nombre, 'Organización Esperanza');
    assert.equal(resultado.nombre_representante, 'María Pérez');
    assert.equal(resultado.telefono, '+56 9 1234 5678');
    assert.equal(resultado.correo, 'contacto@ejemplo.cl');
    assert.equal(resultado.numero_beneficiarios, 120);
  });

  it('rechaza campos obligatorios, tipos y restricciones inválidas', () => {
    const validacion = organizacionSchema.safeParse({
      ...organizacionValida,
      id_pais: 'pais-invalido',
      nombre: '   ',
      nombre_representante: undefined,
      correo: 'correo-invalido',
      numero_beneficiarios: -1,
      tipo_organizacion: 'otra',
      tipo_organizacion_otro: null,
      campo_no_permitido: true,
    });

    assert.equal(validacion.success, false);

    const errores = formatearErroresOrganizacion(validacion.error);
    const campos = new Set(errores.map(({ campo }) => campo));

    for (const campo of [
      'id_pais',
      'nombre',
      'nombre_representante',
      'correo',
      'numero_beneficiarios',
      '_entrada',
    ]) {
      assert.equal(campos.has(campo), true, `Falta error para ${campo}`);
    }

    assert.ok(
      errores.every(({ codigo, mensaje }) => codigo.length > 0 && mensaje.length > 0),
    );

    const otraSinDetalle = organizacionSchema.safeParse({
      ...organizacionValida,
      tipo_organizacion: 'otra',
      tipo_organizacion_otro: null,
    });

    assert.equal(otraSinDetalle.success, false);
    assert.equal(
      formatearErroresOrganizacion(otraSinDetalle.error)[0]?.campo,
      'tipo_organizacion_otro',
    );
  });

  it('limita el teléfono a un máximo de 15 números', () => {
    const quinceNumeros = organizacionSchema.safeParse({
      ...organizacionValida,
      telefono: '+56 9 1234 5678 9012',
    });
    const dieciseisNumeros = organizacionSchema.safeParse({
      ...organizacionValida,
      telefono: '+56 9 1234 5678 9012 3',
    });

    assert.equal(quinceNumeros.success, true);
    assert.equal(dieciseisNumeros.success, false);
    assert.equal(
      formatearErroresOrganizacion(dieciseisNumeros.error)[0]?.campo,
      'telefono',
    );
  });

  it('exige al menos un cambio y valida el tipo otra al actualizar', () => {
    const sinCambios = actualizarOrganizacionSchema.safeParse({
      id_organizacion: '20000000-0000-4000-8000-000000000001',
      cambios: {},
    });
    const otraSinDetalle = actualizarOrganizacionSchema.safeParse({
      id_organizacion: '20000000-0000-4000-8000-000000000001',
      cambios: { tipo_organizacion: 'otra' },
    });

    assert.equal(sinCambios.success, false);
    assert.equal(otraSinDetalle.success, false);
    assert.equal(
      formatearErroresOrganizacion(sinCambios.error)[0]?.campo,
      'cambios',
    );
    assert.equal(
      formatearErroresOrganizacion(otraSinDetalle.error)[0]?.campo,
      'cambios.tipo_organizacion_otro',
    );
  });

  it('valida filtros e identificadores antes de procesar los datos', () => {
    assert.deepEqual(listarOrganizacionesSchema.parse({}), {
      incluir_archivadas: false,
    });
    assert.equal(
      listarOrganizacionesSchema.safeParse({ incluir_archivadas: 'sí' }).success,
      false,
    );
    assert.equal(
      obtenerOrganizacionPorIdSchema.safeParse({ id_organizacion: '123' })
        .success,
      false,
    );
  });
});
