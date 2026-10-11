import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearClienteActas } from '../../src/lib/actas-reunion/cliente.ts';
import { createApiTransport } from '../../src/lib/api/transporte.ts';

const org='11111111-1111-4111-8111-111111111111',plan='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
const registro={id_acta:id,id_organizacion:org,id_plan:plan,id_accion:null,fecha_reunion:'2026-10-08',objetivo:'Histórica',asistentes:[],asistentes_externos:'',observaciones:null,version:1,created_at:'2026-10-08T00:00:00Z',updated_at:'2026-10-08T00:00:00Z',created_by:null};
function cliente(data) { return crearClienteActas(createApiTransport('http://qa.local',async()=>Response.json({ok:true,data})),async()=> 'qa'); }
test('consulta actas históricas sin asistentes, pero exige completarlos al editar',async()=>{
  const c=cliente({meetingMinute:registro});
  const acta=await c.detalle(org,id); assert.deepEqual(acta.asistentes,[]); assert.equal(acta.observaciones,'');
  const {id_acta,id_organizacion,version,created_at,updated_at,compromisos,...campos}=acta;
  await assert.rejects(c.actualizar(org,id,1,{campos}),/al menos un asistente/);
});
test('rechaza respuestas incompletas, IDs cruzados y catálogos incoherentes',async()=>{
  await assert.rejects(cliente({meetingMinutes:null}).obtener(org),{code:'RESPUESTA_INVALIDA'});
  await assert.rejects(cliente({meetingMinute:{...registro,id_acta:plan}}).detalle(org,id),{code:'RESPUESTA_INVALIDA'});
  await assert.rejects(cliente({meetingMinute:{...registro,version:0}}).detalle(org,id),{code:'RESPUESTA_INVALIDA'});
  await assert.rejects(cliente({catalog:{puede_gestionar:true,planes:[],acciones:[{id_accion:id,id_plan:plan,nombre:'Acción'}],asistentes:[]}}).catalogo(org),{code:'RESPUESTA_INVALIDA'});
});
