import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  crearRespuestaErrorPlan,
  manejarActualizarPlan,
  manejarCrearPlan,
  manejarListarPlanes,
  manejarObtenerPlanPorId,
} from '../../src/actions/planes/planes.handler.ts';
import { ErrorOperacionPlan } from '../../src/lib/server/planes.ts';

const cliente = {};
const plan = {
  id_plan: '30000000-0000-4000-8000-000000000001',
  id_organizacion: '10000000-0000-4000-8000-000000000001',
  id_programa: '20000000-0000-4000-8000-000000000001',
  nombre: 'Plan anual',
  situacion_necesidad: 'Necesidad',
  objetivo_general: 'Objetivo',
  objetivos_especificos: 'Objetivos',
  resultado_esperado: 'Resultado',
  responsable_nombre: 'Ana Pérez',
  fecha_inicio: '2026-03-01',
  fecha_termino: '2026-12-15',
  version: 1,
  organizacion: { id: '10000000-0000-4000-8000-000000000001', id_pais: '40000000-0000-4000-8000-000000000001', nombre: 'Organización' },
  programa: { id: '20000000-0000-4000-8000-000000000001', nombre: 'Programa' },
};

const entrada = {
  id_organizacion: plan.id_organizacion,
  id_programa: plan.id_programa,
  nombre: plan.nombre,
  situacion_necesidad: plan.situacion_necesidad,
  objetivo_general: plan.objetivo_general,
  objetivos_especificos: plan.objetivos_especificos,
  resultado_esperado: plan.resultado_esperado,
  responsable_nombre: plan.responsable_nombre,
  fecha_inicio: plan.fecha_inicio,
  fecha_termino: plan.fecha_termino,
};

const operaciones = (cambios = {}) => ({
  listar: async () => [plan],
  obtenerPorId: async () => plan,
  crear: async () => plan,
  actualizar: async () => ({ ...plan, version: 2 }),
  ...cambios,
});

describe('handlers de Astro Actions de Planes', () => {
  it('lista con filtros traducidos al repositorio', async () => {
    let recibidos;
    const respuesta = await manejarListarPlanes(cliente, {
      id_organizacion: plan.id_organizacion,
      id_programa: plan.id_programa,
      incluir_archivados: false,
    }, operaciones({ listar: async (_cliente, filtros) => { recibidos = filtros; return [plan]; } }));
    assert.deepEqual(recibidos, {
      idOrganizacion: plan.id_organizacion,
      idPrograma: plan.id_programa,
      incluirArchivados: false,
    });
    assert.equal(respuesta.ok, true);
    assert.equal(respuesta.codigo, 'PLANES_LISTADOS');
  });

  it('consulta un plan por ID', async () => {
    let id;
    const respuesta = await manejarObtenerPlanPorId(cliente, { id_plan: plan.id_plan }, operaciones({
      obtenerPorId: async (_cliente, recibido) => { id = recibido; return plan; },
    }));
    assert.equal(id, plan.id_plan);
    assert.equal(respuesta.codigo, 'PLAN_OBTENIDO');
  });

  it('crea un plan y conserva la respuesta estable', async () => {
    let datos;
    const respuesta = await manejarCrearPlan(cliente, entrada, operaciones({
      crear: async (_cliente, recibido) => { datos = recibido; return plan; },
    }));
    assert.deepEqual(datos, entrada);
    assert.deepEqual({ ok: respuesta.ok, codigo: respuesta.codigo, mensaje: respuesta.mensaje }, {
      ok: true,
      codigo: 'PLAN_CREADO',
      mensaje: 'El plan fue creado correctamente.',
    });
  });

  it('actualiza con versión esperada', async () => {
    let argumentos;
    const respuesta = await manejarActualizarPlan(cliente, {
      id_plan: plan.id_plan,
      version_esperada: 1,
      cambios: { nombre: 'Plan actualizado' },
    }, operaciones({ actualizar: async (_cliente, id, cambios, version) => {
      argumentos = { id, cambios, version };
      return { ...plan, ...cambios, version: 2 };
    } }));
    assert.deepEqual(argumentos, { id: plan.id_plan, cambios: { nombre: 'Plan actualizado' }, version: 1 });
    assert.equal(respuesta.codigo, 'PLAN_ACTUALIZADO');
    assert.equal(respuesta.datos.version, 2);
  });

  it('devuelve errores de dominio sin detalles internos', async () => {
    const respuesta = await manejarCrearPlan(cliente, entrada, operaciones({
      crear: async () => { throw new ErrorOperacionPlan('SIN_PERMISO', 'No tienes permiso.', {
        code: '42501', message: 'detalle SQL', details: 'interno', hint: 'interno',
      }); },
    }));
    assert.deepEqual(respuesta, { ok: false, codigo: 'SIN_PERMISO', mensaje: 'No tienes permiso.', datos: null });
  });

  it('normaliza configuración ausente y fallos inesperados', () => {
    const configuracion = new Error('Falta configurar Supabase.');
    configuracion.name = 'ErrorConfiguracionSupabase';
    assert.equal(crearRespuestaErrorPlan(configuracion).codigo, 'CONFIGURACION_SUPABASE');
    assert.deepEqual(crearRespuestaErrorPlan(new Error('interno')), {
      ok: false,
      codigo: 'ERROR_INTERNO',
      mensaje: 'Ocurrió un error inesperado al gestionar el plan.',
      datos: null,
    });
  });
});
