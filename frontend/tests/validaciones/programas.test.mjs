import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  actualizarProgramaSchema,
  crearProgramaSchema,
  formatearErroresPrograma,
  lineaAccionProgramaSchema,
  listarProgramasSchema,
  obtenerProgramaPorIdSchema,
} from '../../src/lib/validaciones/programas.ts';

const programaValido = {
  nombre: '  Programa de Formalización  ',
  descripcion: '  Acompañamiento a organizaciones comunitarias.  ',
  objetivo_general: '  Fortalecer la autonomía institucional.  ',
  objetivos_especificos: '  Capacitar equipos y facilitar trámites.  ',
  lineas_accion: [
    {
      linea_accion: '  Capacitación de equipos  ',
      resultado_esperado: '  Equipos con mejores capacidades de gestión.  ',
    },
    {
      linea_accion: '  Gestión de trámites  ',
      resultado_esperado: '  Organizaciones con personalidad jurídica.  ',
    },
  ],
};

describe('schemas Zod de Programas', () => {
  it('normaliza referencias opcionales y permite quitarlas al editar', () => {
    const resultado = crearProgramaSchema.parse({ ...programaValido, referencias_ods: ' ODS 4 ', referencias_esg: ' Social ' });
    assert.equal(resultado.referencias_ods, 'ODS 4');
    assert.equal(resultado.referencias_esg, 'Social');
    const edicion = actualizarProgramaSchema.parse({ id_programa: '11111111-1111-4111-8111-111111111111', cambios: { referencias_ods: '', referencias_esg: '' } });
    assert.equal(edicion.cambios.referencias_ods, '');
  });

  it('rechaza referencias demasiado largas o con tipos inválidos', () => {
    for (const campo of ['referencias_ods', 'referencias_esg']) {
      assert.equal(crearProgramaSchema.safeParse({ ...programaValido, [campo]: 'x'.repeat(2001) }).success, false);
      assert.equal(crearProgramaSchema.safeParse({ ...programaValido, [campo]: 4 }).success, false);
    }
  });
  it('valida el listado y la consulta por identificador', () => {
    assert.deepEqual(listarProgramasSchema.parse({}), {});
    assert.equal(
      listarProgramasSchema.safeParse({ filtro_no_permitido: true }).success,
      false,
    );
    assert.equal(
      obtenerProgramaPorIdSchema.safeParse({
        id_programa: '15800000-0000-4000-8000-000000000001',
      }).success,
      true,
    );
    assert.equal(
      obtenerProgramaPorIdSchema.safeParse({ id_programa: 'invalido' })
        .success,
      false,
    );
  });

  it('acepta y normaliza todos los campos de creación', () => {
    const resultado = crearProgramaSchema.parse(programaValido);

    assert.equal(resultado.nombre, 'Programa de Formalización');
    assert.equal(
      resultado.lineas_accion[0].linea_accion,
      'Capacitación de equipos',
    );
    assert.equal(
      resultado.lineas_accion[0].resultado_esperado,
      'Equipos con mejores capacidades de gestión.',
    );
  });

  it('rechaza campos obligatorios, tipos y campos adicionales', () => {
    const validacion = crearProgramaSchema.safeParse({
      ...programaValido,
      id_organizacion: '15800000-0000-4000-8000-000000000000',
      nombre: '   ',
      descripcion: 123,
      objetivo_general: undefined,
      lineas_accion: 'Capacitación',
    });

    assert.equal(validacion.success, false);

    const errores = formatearErroresPrograma(validacion.error);
    const campos = new Set(errores.map(({ campo }) => campo));

    for (const campo of [
      'nombre',
      'descripcion',
      'objetivo_general',
      'lineas_accion',
      '_entrada',
    ]) {
      assert.equal(campos.has(campo), true, `Falta error para ${campo}`);
    }
  });

  it('exige una lista no vacía de líneas de acción', () => {
    assert.equal(
      crearProgramaSchema.safeParse({
        ...programaValido,
        lineas_accion: [],
      }).success,
      false,
    );

    assert.equal(
      crearProgramaSchema.safeParse({
        ...programaValido,
        lineas_accion: Array.from({ length: 51 }, (_, indice) => ({
          linea_accion: `Línea ${indice + 1}`,
          resultado_esperado: `Resultado ${indice + 1}`,
        })),
      }).success,
      false,
    );
  });

  it('exige un resultado esperado válido para cada línea', () => {
    const sinResultado = crearProgramaSchema.safeParse({
      ...programaValido,
      lineas_accion: [
        {
          linea_accion: 'Capacitación',
          resultado_esperado: '   ',
        },
      ],
    });

    assert.equal(sinResultado.success, false);
    assert.equal(
      formatearErroresPrograma(sinResultado.error)[0]?.campo,
      'lineas_accion.0.resultado_esperado',
    );

    assert.equal(
      lineaAccionProgramaSchema.safeParse({
        linea_accion: 'Capacitación',
      }).success,
      false,
    );
  });

  it('rechaza líneas de acción duplicadas sin distinguir mayúsculas', () => {
    const validacion = crearProgramaSchema.safeParse({
      ...programaValido,
      lineas_accion: [
        {
          linea_accion: 'Capacitación',
          resultado_esperado: 'Primer resultado',
        },
        {
          linea_accion: '  CAPACITACIÓN  ',
          resultado_esperado: 'Segundo resultado',
        },
      ],
    });

    assert.equal(validacion.success, false);
    assert.deepEqual(formatearErroresPrograma(validacion.error)[0], {
      campo: 'lineas_accion.1.linea_accion',
      codigo: 'custom',
      mensaje:
        'La línea de acción está repetida; ya fue incluida en la posición 1.',
    });
  });

  it('permite actualizar parcialmente y exige al menos un cambio', () => {
    const resultado = actualizarProgramaSchema.parse({
      id_programa: '15800000-0000-4000-8000-000000000001',
      version_esperada: 2,
      cambios: {
        nombre: '  Nuevo nombre  ',
      },
    });

    assert.equal(resultado.cambios.nombre, 'Nuevo nombre');

    const sinCambios = actualizarProgramaSchema.safeParse({
      id_programa: '15800000-0000-4000-8000-000000000001',
      cambios: {},
    });
    const versionInvalida = actualizarProgramaSchema.safeParse({
      id_programa: '15800000-0000-4000-8000-000000000001',
      version_esperada: 0,
      cambios: { nombre: 'Nombre válido' },
    });

    assert.equal(sinCambios.success, false);
    assert.equal(versionInvalida.success, false);
    assert.equal(
      formatearErroresPrograma(sinCambios.error)[0]?.campo,
      'cambios',
    );
  });

  it('entrega errores claros y estables para los formularios', () => {
    const validacion = actualizarProgramaSchema.safeParse({
      id_programa: 'id-invalido',
      cambios: {
        lineas_accion: [
          {
            linea_accion: '',
            resultado_esperado: false,
          },
        ],
      },
    });

    assert.equal(validacion.success, false);

    const errores = formatearErroresPrograma(validacion.error);
    assert.ok(errores.length >= 3);
    assert.ok(
      errores.every(
        ({ campo, codigo, mensaje }) =>
          campo.length > 0 && codigo.length > 0 && mensaje.length > 0,
      ),
    );
  });
});
