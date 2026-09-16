import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  identificarErroresValidacion,
  recibirDatosPruebaSchema,
} from '../../src/actions/prueba/recibir-datos.schema.ts';
import {
  CODIGO_DATOS_RECIBIDOS,
  procesarDatosPrueba,
} from '../../src/actions/prueba/recibir-datos.handler.ts';

describe('recibirDatosPrueba', () => {
  it('acepta, normaliza y procesa datos válidos', () => {
    const entrada = recibirDatosPruebaSchema.parse({
      nombre: '  María Pérez  ',
      correo: 'MARIA@EXAMPLE.COM',
      mensaje: '  Mensaje de prueba  ',
    });

    const resultado = procesarDatosPrueba(entrada);

    assert.deepEqual(resultado, {
      ok: true,
      codigo: CODIGO_DATOS_RECIBIDOS,
      mensaje: 'Los datos fueron recibidos correctamente.',
      datos: {
        nombre: 'María Pérez',
        correo: 'maria@example.com',
        mensaje: 'Mensaje de prueba',
      },
    });
  });

  it('rechaza datos inválidos con campo, código y mensaje identificables', () => {
    const validacion = recibirDatosPruebaSchema.safeParse({
      nombre: 'M',
      correo: 'correo-invalido',
      mensaje: '',
    });

    assert.equal(validacion.success, false);

    const errores = identificarErroresValidacion(validacion.error);

    assert.deepEqual(
      errores.map(({ campo }) => campo),
      ['nombre', 'correo', 'mensaje'],
    );
    assert.ok(errores.every(({ codigo, mensaje }) => codigo && mensaje));
  });

  it('rechaza propiedades no declaradas en el contrato', () => {
    const validacion = recibirDatosPruebaSchema.safeParse({
      nombre: 'María',
      correo: 'maria@example.com',
      mensaje: 'Hola',
      rol: 'admin',
    });

    assert.equal(validacion.success, false);
    assert.equal(
      identificarErroresValidacion(validacion.error)[0]?.campo,
      '_entrada',
    );
  });
});
