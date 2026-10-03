import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearPlanSchema, actualizarPlanSchema, listarPlanesSchema } from '../../src/actions/planes/planes.schema.ts';
import { crearAccionSchema, actualizarAccionSchema, listarAccionesSchema } from '../../src/actions/acciones/acciones.schema.ts';
import { actualizarPlan, listarPlanes, listarOrganizacionesParaPlan } from '../../src/lib/server/planes.ts';
import { actualizarAccion } from '../../src/lib/server/acciones.ts';

const id = '84000000-0000-4000-8000-000000000001';
const plan = { id_organizacion:id,id_programa:id,nombre:'Plan',situacion_necesidad:'Necesidad',objetivo_general:'Objetivo',objetivos_especificos:'Talleres',resultado_esperado:'Resultado',responsable_nombre:'Responsable',periodo_anual:2026,fecha_inicio:'2026-12-01',fecha_termino:'2027-03-01' };
const accion = { id_plan:id,nombre:'Taller',responsable_nombre:'Responsable',fecha_inicio:'2026-10-01',fecha_termino:'2026-12-01' };

test('SCRUM-84: período obligatorio, entero, editable, filtrable e independiente de fechas', () => {
  assert.equal(crearPlanSchema.safeParse(plan).success, true);
  for (const periodo_anual of [undefined,null,'2026',true,0,10000,2026.5]) assert.equal(crearPlanSchema.safeParse({...plan,periodo_anual}).success,false);
  assert.deepEqual(actualizarPlanSchema.parse({id_plan:id,version_esperada:1,cambios:{periodo_anual:2027}}).cambios,{periodo_anual:2027});
  assert.deepEqual(listarPlanesSchema.parse({periodo_anual:2026}),{periodo_anual:2026,incluir_archivados:false});
});

test('SCRUM-87: descripción opcional y cuatro estados, sin Vencida asignable', () => {
  assert.equal(crearAccionSchema.parse({...accion,descripcion:'  Taller de formación  '}).descripcion,'Taller de formación');
  assert.equal(crearAccionSchema.parse({...accion,descripcion:'  '}).descripcion,null);
  for (const estado of ['no_iniciada','en_desarrollo','cancelada','cumplida']) assert.equal(crearAccionSchema.safeParse({...accion,estado,observacion_motivo:'Motivo'}).success,true);
  for (const estado of ['atrasada','vencida','otro']) {
    assert.equal(crearAccionSchema.safeParse({...accion,estado}).success,false);
    assert.equal(listarAccionesSchema.safeParse({estado}).success,false);
  }
});

test('edición parcial conserva campos omitidos y permite limpiar descripción explícitamente', () => {
  assert.deepEqual(actualizarAccionSchema.parse({id_accion:id,version_esperada:2,cambios:{responsable_nombre:'Otro'}}).cambios,{responsable_nombre:'Otro'});
  assert.deepEqual(actualizarAccionSchema.parse({id_accion:id,version_esperada:2,cambios:{descripcion:null}}).cambios,{descripcion:null});
  assert.equal(actualizarAccionSchema.safeParse({id_accion:id,version_esperada:2,cambios:{estado:'cancelada'}}).success,true); // El CHECK valida el motivo persistido.
  assert.equal(actualizarAccionSchema.safeParse({id_accion:id,version_esperada:2,cambios:{estado:'cancelada',observacion_motivo:null}}).success,false);
});

test('las dos ediciones exigen versión también al invocar el repositorio', async () => {
  const noEscribir = {from(){throw new Error('No debe emitir ninguna escritura');}};
  for (const version_esperada of [undefined,0,-1,1.5,NaN]) {
    assert.equal(actualizarPlanSchema.safeParse({id_plan:id,version_esperada,cambios:{nombre:'Otro'}}).success,false);
    assert.equal(actualizarAccionSchema.safeParse({id_accion:id,version_esperada,cambios:{nombre:'Otro'}}).success,false);
    await assert.rejects(actualizarPlan(noEscribir,id,{nombre:'Otro'},version_esperada),{codigo:'RESTRICCION_INCUMPLIDA'});
    await assert.rejects(actualizarAccion(noEscribir,id,{nombre:'Otro'},version_esperada),{codigo:'RESTRICCION_INCUMPLIDA'});
  }
});

test('consulta de Planes propaga el filtro anual y selecciona el campo', async () => {
  const calls = []; const query = {select(s){calls.push(['select',s]);return this;},order(){return this;},is(){return this;},eq(k,v){calls.push([k,v]);return this;},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve);}};
  await listarPlanes({from(){return query;}},{periodoAnual:2026});
  assert.ok(calls.some(([k,v])=>k==='periodo_anual' && v===2026));
  assert.match(calls[0][1],/periodo_anual/);
});

test('selector de Organización consulta solo identidad, país y nombre de entidades activas', async () => {
  const calls=[]; const q={select(s){calls.push(['select',s]);return this;},is(k,v){calls.push(['is',k,v]);return this;},order(k){calls.push(['order',k]);return Promise.resolve({data:[],error:null});}};
  assert.deepEqual(await listarOrganizacionesParaPlan({from(tabla){assert.equal(tabla,'organizaciones');return q;}}),[]);
  assert.deepEqual(calls,[['select','id_organizacion,id_pais,nombre'],['is','archived_at',null],['order','nombre']]);
});
