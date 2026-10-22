import type { ConsolidatedReportSnapshot } from '../../src/domain/insights.ts';
export function reportFixture(reference=false):ConsolidatedReportSnapshot {
  const orgCount=reference?50:2,planCount=reference?300:3,actionCount=reference?2000:6;
  const organizations=Array.from({length:orgCount},(_,i)=>({id_organizacion:`org-${i}`,nombre:`Organización solidaria ${i+1}`,numero_beneficiarios:100,pais:['Chile','Argentina','Uruguay'][i%3]}));
  const plans=Array.from({length:planCount},(_,i)=>({id_plan:`plan-${i}`,nombre:`Plan comunitario ${i+1}`,organizacion:organizations[i%orgCount].nombre,programa:`Programa institucional ${i%6+1}`,fecha_inicio:'2026-01-01',fecha_termino:'2026-12-31'}));
  const actions=Array.from({length:actionCount},(_,i)=>({id_accion:`action-${i}`,nombre:`Acción de acompañamiento ${i+1}`,estado:i%2===0?'cumplida':'en_desarrollo',fecha_inicio:'2026-02-01',fecha_termino:'2026-10-21',plan:plans[i%planCount].nombre}));
  return {
    generatedAt:'2026-10-21T18:30:00.000Z',period:{start:'2026-01-01',end:'2026-12-31'},filters:{startDate:'2026-01-01',endDate:'2026-12-31'},
    sections:{organizations,plans,actions,
      commitments:[{id_compromiso:'commitment-1',acuerdo:'Entregar material para el taller de alimentación saludable.',estado:'cumplido',fecha_cumplimiento:'2026-10-15T12:00:00Z',organizacion:organizations[0].nombre},
        {id_compromiso:'commitment-2',acuerdo:'Compromiso aún pendiente',estado:'pendiente',fecha_cumplimiento:null,organizacion:organizations[0].nombre}],
      donations:[{id_donacion:'donation-1',fecha:'2026-10-15',tipo_aporte:'dinero',monto:25000,cantidad:null,organizacion:organizations[0].nombre},
        {id_donacion:'donation-2',fecha:'2026-10-17',tipo_aporte:'recurso',monto:null,cantidad:12,organizacion:organizations[1].nombre}],
      indicators:[{id_indicador:'indicator-1',nombre:'Participación en jornadas',valor_obtenido:42,organizacion:organizations[0].nombre}],
      results:[{id_resultado:'result-1',descripcion:'Se completó el ciclo de formación y seguimiento.',fecha_obtencion:'2026-10-20',organizacion:organizations[0].nombre}]},
    summary:{totalBeneficiaries:orgCount*100,totalDonationsAmount:25000,completedActions:actionCount/2},
  };
}
