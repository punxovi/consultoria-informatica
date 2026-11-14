import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConsolidatedFilters } from '../src/domain/insights.ts';
import { parseConsolidatedSnapshot, validateConsolidatedFilters } from '../src/domain/consolidated-report.ts';
const filters={startDate:'2026-06-01',endDate:'2026-06-30'};
const empty=()=>({generatedAt:'2026-11-06T12:00:00Z',period:{start:filters.startDate,end:filters.endDate},filters,
  sections:{organizations:[],plans:[],actions:[],commitments:[],donations:[],indicators:[],results:[]},
  summary:{totalBeneficiaries:0,totalDonationsAmount:0,completedActions:0}});
test('valida fechas calendario, orden, UUID, filtros desconocidos y listas vacías',()=>{
  assert.deepEqual(validateConsolidatedFilters(filters),filters);
  for(const input of [{},{...filters,startDate:'2026-02-30'},{...filters,startDate:'0000-01-01'},
    {...filters,endDate:'2026-05-01'},{...filters,countryId:'x'},{...filters,indicatorIds:[]},{...filters,foo:true}])
    assert.throws(()=>validateConsolidatedFilters(input),{code:'DATOS_INVALIDOS'});
});
test('vacío válido se distingue de respuesta rota, desfasada, duplicada o totales incorrectos',()=>{
  assert.deepEqual(parseConsolidatedSnapshot(empty(),filters),empty());
  const org={id_organizacion:'17600000-0000-4000-8000-000000000001',nombre:'QA',pais:'Chile',numero_beneficiarios:0};
  const duplicate={...empty(),sections:{...empty().sections,organizations:[org,org]}};
  for(const input of [null,[],{}, {...empty(),sections:{}}, {...empty(),filters:{...filters,endDate:'2026-07-01'}},
    {...empty(),summary:{...empty().summary,totalBeneficiaries:3}},duplicate])
    assert.throws(()=>parseConsolidatedSnapshot(input,filters),{code:'RESPUESTA_INVALIDA'});
});

test('HTTP rechaza listas presentes pero vacías',()=>{
  for(const field of ['indicadores','resultados'])
    assert.throws(()=>parseConsolidatedFilters(new URL(`https://qa.invalid?fecha_inicio=2026-06-01&fecha_termino=2026-06-30&${field}=`)),{code:'DATOS_INVALIDOS'});
});
