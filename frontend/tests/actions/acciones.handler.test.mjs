import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  crearRespuestaErrorAccion,
  manejarActualizarAccion,
  manejarCrearAccion,
  manejarListarAcciones,
  manejarObtenerAccionPorId,
} from '../../src/actions/acciones/acciones.handler.ts';
import { ErrorOperacionAccion } from '../../src/lib/server/acciones.ts';

const cliente = {};
const accion = {
  id_accion: '40000000-0000-4000-8000-000000000001',
  id_plan: '30000000-0000-4000-8000-000000000001',
  nombre: 'Taller',
  responsable_nombre: 'Ana',
  fecha_inicio: '2026-03-01',
  fecha_termino: '2026-04-01',
  estado: 'no_iniciada',
  observacion_motivo: null,
  resultado_esperado: 'Resultado',
  version: 1,
};

const operaciones = (cambios = {}) => ({
  listar: async () => [accion],
  obtenerPorId: async () => accion,
  crear: async () => accion,
  actualizar: async () => ({ ...accion, version: 2 }),
  ...cambios,
});

describe('handlers de Astro Actions de Acciones', () => {
  it('lista por Plan y estado con respuesta estable', async () => {
    let filtros;
    const respuesta = await manejarListarAcciones(cliente, {
      id_plan: accion.id_plan,
      estado: 'no_iniciada',
      incluir_archivadas: false,
    }, operaciones({ listar: async (_cliente, recibidos) => { filtros = recibidos; return [accion]; } }));
    assert.deepEqual(filtros, { idPlan: accion.id_plan, estado: 'no_iniciada', incluirArchivadas: false });
    assert.equal(respuesta.codigo, 'ACCIONES_LISTADAS');
  });

  it('consulta, crea y actualiza la Acción', async () => {
    const detalle = await manejarObtenerAccionPorId(cliente, { id_accion: accion.id_accion }, operaciones());
    assert.equal(detalle.codigo, 'ACCION_OBTENIDA');

    let creada;
    const entrada = { ...accion };
    delete entrada.id_accion;
    delete entrada.version;
    const creacion = await manejarCrearAccion(cliente, entrada, operaciones({
      crear: async (_cliente, datos) => { creada = datos; return accion; },
    }));
    assert.deepEqual(creada, entrada);
    assert.equal(creacion.codigo, 'ACCION_CREADA');

    let actualizacion;
    const editada = await manejarActualizarAccion(cliente, {
      id_accion: accion.id_accion,
      version_esperada: 1,
      cambios: { estado: 'en_desarrollo' },
    }, operaciones({ actualizar: async (_cliente, id, cambios, version) => {
      actualizacion = { id, cambios, version };
      return { ...accion, ...cambios, version: 2 };
    } }));
    assert.deepEqual(actualizacion, { id: accion.id_accion, cambios: { estado: 'en_desarrollo' }, version: 1 });
    assert.equal(editada.codigo, 'ACCION_ACTUALIZADA');
  });

  it('oculta detalles internos y normaliza errores inesperados', async () => {
    const dominio = await manejarCrearAccion(cliente, accion, operaciones({
      crear: async () => { throw new ErrorOperacionAccion('SIN_PERMISO', 'No tienes permiso.', { code: '42501', message: 'SQL interno' }); },
    }));
    assert.deepEqual(dominio, { ok: false, codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso.', datos: null });
    assert.equal(crearRespuestaErrorAccion(new Error('interno')).codigo, 'ERROR_INTERNO');
  });
});
