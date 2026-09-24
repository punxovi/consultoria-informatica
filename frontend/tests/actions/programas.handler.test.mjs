import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  crearRespuestaErrorPrograma,
  manejarActualizarPrograma,
  manejarCrearPrograma,
  manejarListarProgramas,
  manejarObtenerProgramaPorId,
} from '../../src/actions/programas/programas.handler.ts';
import {
  ErrorOperacionLineaAccionPrograma,
} from '../../src/lib/server/programa-lineas-accion.ts';
import { ErrorOperacionPrograma } from '../../src/lib/server/programas.ts';

const cliente = {};
const programa = {
  id_programa: '17100000-0000-4000-8000-000000000001',
  nombre: 'Programa Institucional',
  descripcion: 'Descripción',
  objetivo_general: 'Objetivo general',
  objetivos_especificos: 'Objetivos específicos',
  componentes_linea_accion: 'Capacitación',
  resultados_esperados: 'Equipo capacitado',
  version: 1,
};
const linea = {
  id_linea_accion: '17110000-0000-4000-8000-000000000001',
  id_programa: programa.id_programa,
  linea_accion: 'Capacitación',
  resultado_esperado: 'Equipo capacitado',
  version: 1,
};

function operacionesFalsas(sobrescrituras = {}) {
  return {
    listarProgramas: async () => [programa],
    obtenerProgramaPorId: async () => programa,
    crearPrograma: async () => programa,
    actualizarPrograma: async () => ({ ...programa, version: 2 }),
    listarLineas: async () => [linea],
    crearLinea: async (_cliente, entrada) => ({
      ...linea,
      ...entrada,
      id_linea_accion: `nueva-${entrada.linea_accion}`,
    }),
    actualizarLinea: async (_cliente, id, cambios) => ({
      ...linea,
      ...cambios,
      id_linea_accion: id,
      version: 2,
    }),
    archivarLinea: async (_cliente, id) => ({
      ...linea,
      id_linea_accion: id,
      archived_at: '2026-09-23T12:00:00.000Z',
      version: 2,
    }),
    ...sobrescrituras,
  };
}

describe('handlers de Actions de Programas', () => {
  it('lista Programas con sus líneas de acción', async () => {
    const respuesta = await manejarListarProgramas(
      cliente,
      operacionesFalsas(),
    );

    assert.equal(respuesta.ok, true);
    assert.equal(respuesta.codigo, 'PROGRAMAS_LISTADOS');
    assert.deepEqual(respuesta.datos[0].lineas_accion, [linea]);
  });

  it('consulta un Programa por ID y adjunta sus líneas', async () => {
    let idConsultado;
    const respuesta = await manejarObtenerProgramaPorId(
      cliente,
      { id_programa: programa.id_programa },
      operacionesFalsas({
        obtenerProgramaPorId: async (_cliente, id) => {
          idConsultado = id;
          return programa;
        },
      }),
    );

    assert.equal(respuesta.ok, true);
    assert.equal(idConsultado, programa.id_programa);
    assert.deepEqual(respuesta.datos.lineas_accion, [linea]);
  });

  it('crea el Programa y cada línea con su resultado esperado', async () => {
    let entradaPrograma;
    const entradasLineas = [];
    const respuesta = await manejarCrearPrograma(
      cliente,
      {
        nombre: programa.nombre,
        descripcion: programa.descripcion,
        objetivo_general: programa.objetivo_general,
        objetivos_especificos: programa.objetivos_especificos,
        lineas_accion: [
          {
            linea_accion: 'Capacitación',
            resultado_esperado: 'Equipo capacitado',
          },
          {
            linea_accion: 'Acompañamiento',
            resultado_esperado: 'Organización fortalecida',
          },
        ],
      },
      operacionesFalsas({
        crearPrograma: async (_cliente, entrada) => {
          entradaPrograma = entrada;
          return programa;
        },
        crearLinea: async (_cliente, entrada) => {
          entradasLineas.push(entrada);
          return { ...linea, ...entrada };
        },
      }),
    );

    assert.equal(respuesta.ok, true);
    assert.equal(respuesta.codigo, 'PROGRAMA_CREADO');
    assert.equal(entradaPrograma.componentes_linea_accion, 'Capacitación\nAcompañamiento');
    assert.equal(entradaPrograma.resultados_esperados, 'Equipo capacitado\nOrganización fortalecida');
    assert.equal(entradasLineas.length, 2);
    assert.ok(
      entradasLineas.every(
        ({ id_programa }) => id_programa === programa.id_programa,
      ),
    );
  });

  it('actualiza el Programa y sincroniza líneas existentes, nuevas y retiradas', async () => {
    const lineaSobrante = {
      ...linea,
      id_linea_accion: '17110000-0000-4000-8000-000000000002',
      linea_accion: 'Línea retirada',
    };
    const actualizadas = [];
    const creadas = [];
    const archivadas = [];
    let cambiosPrograma;
    const respuesta = await manejarActualizarPrograma(
      cliente,
      {
        id_programa: programa.id_programa,
        version_esperada: 1,
        cambios: {
          descripcion: 'Descripción actualizada',
          lineas_accion: [
            {
              linea_accion: 'Capacitación',
              resultado_esperado: 'Equipo certificado',
            },
            {
              linea_accion: 'Acompañamiento',
              resultado_esperado: 'Organización fortalecida',
            },
          ],
        },
      },
      operacionesFalsas({
        listarLineas: async () => [linea, lineaSobrante],
        actualizarPrograma: async (_cliente, _id, cambios) => {
          cambiosPrograma = cambios;
          return { ...programa, ...cambios, version: 2 };
        },
        actualizarLinea: async (_cliente, id, cambios) => {
          actualizadas.push({ id, cambios });
          return { ...linea, ...cambios, id_linea_accion: id, version: 2 };
        },
        crearLinea: async (_cliente, entrada) => {
          creadas.push(entrada);
          return { ...linea, ...entrada, id_linea_accion: 'nueva' };
        },
        archivarLinea: async (_cliente, id) => {
          archivadas.push(id);
          return lineaSobrante;
        },
      }),
    );

    assert.equal(respuesta.ok, true);
    assert.equal(cambiosPrograma.descripcion, 'Descripción actualizada');
    assert.equal(cambiosPrograma.componentes_linea_accion, 'Capacitación\nAcompañamiento');
    assert.equal(actualizadas.length, 2);
    assert.equal(creadas.length, 0);
    assert.equal(archivadas.length, 0);
    assert.equal(respuesta.datos.lineas_accion[0].resultado_esperado, 'Equipo certificado');
  });

  it('crea líneas adicionales y archiva las que se eliminan', async () => {
    const creadas = [];
    const archivadas = [];
    const base = operacionesFalsas({
      listarLineas: async () => [],
      crearLinea: async (_cliente, entrada) => {
        creadas.push(entrada);
        return { ...linea, ...entrada };
      },
    });
    const conNueva = await manejarActualizarPrograma(
      cliente,
      {
        id_programa: programa.id_programa,
        cambios: {
          lineas_accion: [
            {
              linea_accion: 'Nueva línea',
              resultado_esperado: 'Nuevo resultado',
            },
          ],
        },
      },
      base,
    );

    assert.equal(conNueva.ok, true);
    assert.equal(creadas.length, 1);

    const lineaSobrante = {
      ...linea,
      id_linea_accion: '17110000-0000-4000-8000-000000000099',
      linea_accion: 'Línea retirada',
    };
    const conSobrante = await manejarActualizarPrograma(
      cliente,
      {
        id_programa: programa.id_programa,
        cambios: {
          lineas_accion: [
            {
              linea_accion: linea.linea_accion,
              resultado_esperado: linea.resultado_esperado,
            },
          ],
        },
      },
      operacionesFalsas({
        listarLineas: async () => [linea, lineaSobrante],
        archivarLinea: async (_cliente, id) => {
          archivadas.push(id);
          return lineaSobrante;
        },
      }),
    );

    assert.equal(conSobrante.ok, true);
    assert.deepEqual(archivadas, [lineaSobrante.id_linea_accion]);
  });

  it('conserva errores de dominio sin exponer detalles de Supabase', async () => {
    const respuesta = await manejarObtenerProgramaPorId(
      cliente,
      { id_programa: programa.id_programa },
      operacionesFalsas({
        obtenerProgramaPorId: async () => {
          throw new ErrorOperacionPrograma(
            'NO_ENCONTRADO',
            'El programa solicitado no existe.',
          );
        },
      }),
    );
    const lineaDuplicada = crearRespuestaErrorPrograma(
      new ErrorOperacionLineaAccionPrograma(
        'LINEA_DUPLICADA',
        'Ya existe una línea de acción con ese nombre en el programa.',
      ),
    );

    assert.deepEqual(respuesta, {
      ok: false,
      codigo: 'NO_ENCONTRADO',
      mensaje: 'El programa solicitado no existe.',
      datos: null,
    });
    assert.equal(lineaDuplicada.codigo, 'LINEA_DUPLICADA');
    assert.equal(Object.hasOwn(lineaDuplicada, 'detalle'), false);
  });

  it('devuelve errores estables para configuración y fallos inesperados', () => {
    const configuracion = Object.assign(new Error('Falta configuración'), {
      name: 'ErrorConfiguracionSupabase',
    });

    assert.equal(
      crearRespuestaErrorPrograma(configuracion).codigo,
      'CONFIGURACION_SUPABASE',
    );
    assert.deepEqual(crearRespuestaErrorPrograma(new Error('secreto interno')), {
      ok: false,
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error inesperado al gestionar el programa.',
      datos: null,
    });
  });
});
