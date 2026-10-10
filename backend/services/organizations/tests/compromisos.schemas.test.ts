import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCamposCompromiso,parseActualizarCompromisoInput } from '../src/domain/compromisos.ts';
const valid={id_acta:'11111111-1111-4111-8111-111111111111',descripcion:' Acuerdo ',responsable_nombre:'Ana',responsable_contacto:'ana@example.invalid',fecha_limite:'2026-10-12',observaciones:''};
test('Compromisos: normaliza campos y exige acta, contacto, fechas y límites reales',()=>{
  assert.equal(parseCamposCompromiso(valid).descripcion,'Acuerdo');assert.equal(parseCamposCompromiso(valid).estado,'pendiente');
  for(const campo of ['id_acta','descripcion','responsable_nombre','responsable_contacto','fecha_limite']) assert.throws(()=>parseCamposCompromiso({...valid,[campo]:''}),{code:'DATOS_INVALIDOS'});
  assert.throws(()=>parseCamposCompromiso({...valid,fecha_limite:'2026-02-30'}),{code:'DATOS_INVALIDOS'});
  assert.throws(()=>parseCamposCompromiso({...valid,descripcion:'a'.repeat(2001)}),{code:'DATOS_INVALIDOS'});
  assert.throws(()=>parseCamposCompromiso({...valid,estado:'cumplido'}),{code:'DATOS_INVALIDOS'});
});
test('Compromisos: edición parcial exige versión y no admite vínculos ni campos de auditoría',()=>{
  const actualizacion=parseActualizarCompromisoInput({version_esperada:2,cambios:{estado:'cumplido',observaciones:''}});
  assert.equal(actualizacion.versionEsperada,2);assert.equal(actualizacion.cambios.observaciones,null);
  for(const datos of [{cambios:{estado:'cumplido'}},{version_esperada:0,cambios:{estado:'cumplido'}},{version_esperada:1,cambios:{}}]) assert.throws(()=>parseActualizarCompromisoInput(datos),{code:'DATOS_INVALIDOS'});
  for(const campo of ['id_acta','id_organizacion','version','created_by','cumplido_at','archived_at']) assert.throws(()=>parseActualizarCompromisoInput({version_esperada:1,cambios:{[campo]:null}}),{code:'DATOS_INVALIDOS'});
  for(const estado of ['vencido','en_proceso','cancelado']) assert.throws(()=>parseActualizarCompromisoInput({version_esperada:1,cambios:{estado}}),{code:'DATOS_INVALIDOS'});
});
