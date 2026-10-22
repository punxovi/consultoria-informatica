import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCreateDonation, parseUpdateDonation, parseArchiveDonation, assertDonationTransition, mergeDonationChanges, ESTADOS_DONACION } from '../src/domain/donations.ts';
import { createSupabaseOrganizationsRepository } from '../src/infrastructure/supabase-organizations.repository.ts';
import { createOrganizationsApplication } from '../src/application/organizations-service.ts';
import { createOrganizationsServer } from '../src/server.ts';

const org = '13100000-0000-4000-8000-000000000001';
const country = '13100000-0000-4000-8000-000000000002';
const program = '13100000-0000-4000-8000-000000000003';
const id = '13100000-0000-4000-8000-000000000004';
const other = '13100000-0000-4000-8000-000000000099';
const valid = { fecha: '2026-10-21', id_pais: country, tipo_movimiento: 'recibida',
  contraparte_nombre: 'Donante de prueba', descripcion: 'Horas profesionales', categoria: 'Servicio',
  tipo_aporte: 'recurso', tipo_donante: 'empresa', origen: 'Campaña', estado: 'Comprometida',
  cantidad: 2, unidad: 'horas', valor_estimado: 100, moneda_valorizacion: 'CLP', metodo_valorizacion: 'Cotización' };

for (const field of ['fecha','id_pais','contraparte_nombre','descripcion','categoria','tipo_aporte','tipo_donante','origen','estado','tipo_movimiento']) {
  test(`Zod: exige ${field}`, () => {
    const input: Record<string, unknown> = { ...valid }; delete input[field];
    assert.throws(() => parseCreateDonation(input), { code: 'DATOS_INVALIDOS' });
  });
}
for (const changes of [
  {fecha:'2026-02-29'}, {fecha:'2026-04-31'}, {fecha:'2026-13-01'}, {fecha:'0000-01-01'}, {fecha:'21/10/2026'},
  {fecha:'2026-10-21T00:00:00Z'}, {categoria:'Alimentos'}, {estado:'Pendiente'}, {tipo_donante:'otro'},
  {cantidad:0}, {cantidad:-1}, {cantidad:NaN}, {cantidad:Infinity}, {cantidad:'2'}, {unidad:' '},
  {valor_estimado:-1}, {valor_estimado:Infinity}, {valor_estimado:NaN}, {moneda_valorizacion:'clp'},
  {metodo_valorizacion:' '}, {categoria:'Otro'}, {categoria_otro:'No corresponde'}, {categoria:'Dinero'},
  {origen:' '}, {id_pais:'x'}, {id_programa:'x'}, {created_by:org},
]) {
  test(`Zod: rechaza ${Object.keys(changes)[0]} inválido ${String(Object.values(changes)[0])}`, () => {
    assert.throws(() => parseCreateDonation({...valid,...changes}), {code:'DATOS_INVALIDOS'});
  });
}
test('Zod: acepta año bisiesto, Otro y valor cero, sin cantidad cuando no corresponde', () => {
  const input = parseCreateDonation({...valid, fecha:'2024-02-29', categoria:'Otro', categoria_otro:'Aporte descrito',
    cantidad:undefined, unidad:undefined, valor_estimado:0});
  assert.equal(input.valor_estimado,0);
});
test('Zod: el monto efectivo rechaza cero, negativos, no finitos y cadenas', () => {
  for (const monto of [0,-1,NaN,Infinity,-Infinity,'100']) {
    assert.throws(() => parseCreateDonation({...valid,tipo_aporte:'dinero',categoria:'Dinero',
      cantidad:undefined,unidad:undefined,monto,moneda:'CLP'}),{code:'DATOS_INVALIDOS'});
  }
});
test('Zod: modificaciones parciales exigen versión, campos editables y cambios', () => {
  for (const input of [{cambios:{estado:'Recibida'}},{version_esperada:0,cambios:{estado:'Recibida'}},
    {version_esperada:Infinity,cambios:{estado:'Recibida'}},{version_esperada:1,cambios:{}},
    {version_esperada:1,cambios:{id_organizacion:other}},{version_esperada:1,cambios:{id_pais:other}},
    {version_esperada:1,cambios:{archived_at:'2026-10-21'}},{version_esperada:1,cambios:{version:5}}]) {
    assert.throws(() => parseUpdateDonation(input), {code:'DATOS_INVALIDOS'});
  }
  assert.deepEqual(parseArchiveDonation({version_esperada:1}),{version_esperada:1});
  assert.throws(() => parseArchiveDonation({version_esperada:1.5}),{code:'DATOS_INVALIDOS'});
});
test('Negocio: solo permite la secuencia autorizada; no hay saltos ni retrocesos', () => {
  for (let from=0;from<4;from++) for(let to=0;to<4;to++) {
    if (to===from || to===from+1) assert.doesNotThrow(() => assertDonationTransition(ESTADOS_DONACION[from],ESTADOS_DONACION[to]));
    else assert.throws(() => assertDonationTransition(ESTADOS_DONACION[from],ESTADOS_DONACION[to]),{code:'TRANSICION_NO_PERMITIDA'});
  }
  assert.doesNotThrow(() => assertDonationTransition(null,'Comprometida'));
  assert.throws(() => assertDonationTransition(null,'Recibida'),{code:'TRANSICION_NO_PERMITIDA'});
});
test('Negocio: valida valores combinados y permite limpiar campos dependientes', () => {
  const current = {...parseCreateDonation(valid),id_donacion:id,id_organizacion:org,version:1} as any;
  assert.throws(() => mergeDonationChanges(current,{cantidad:null}),{code:'DATOS_INVALIDOS'});
  assert.throws(() => mergeDonationChanges(current,{moneda_valorizacion:null}),{code:'DATOS_INVALIDOS'});
  const next=mergeDonationChanges(current,{categoria:'Dinero',tipo_aporte:'dinero',cantidad:null,unidad:null,monto:10,moneda:'CLP'});
  assert.equal(next.monto,10); assert.equal(next.cantidad,undefined);
});

interface Options { allowed?:boolean; orgExists?:boolean; countryExists?:boolean; programExists?:boolean;
  conflict?:boolean; persistCode?:string; network?:boolean; invalidSession?:boolean; }
async function api(options:Options={}) {
  const rows: any[] = [{...valid,id_donacion:id,id_organizacion:org,id_programa:null,version:1,
    monto:null,moneda:null,categoria_otro:null,created_at:'2026-10-21T10:00:00Z',updated_at:'2026-10-21T10:00:00Z',archived_at:null}];
  const calls: Array<{path:string;method:string;params:URLSearchParams;body:any}> = [];
  const repository=createSupabaseOrganizationsRepository({supabaseUrl:'https://supabase.invalid',anonKey:'test-public',
    fetchImpl:async (url,init) => {
      const u=new URL(String(url)); const path=u.pathname.split('/').at(-1)!; const method=init?.method??'GET';
      const body=init?.body?JSON.parse(String(init.body)):null; calls.push({path,method,params:u.searchParams,body});
      assert.equal((init?.headers as Record<string,string>).authorization,'Bearer test-session');
      if(options.network) throw new Error('Network failure');
      if(options.invalidSession) return Response.json({code:'PGRST301'},{status:401});
      if(path==='organizaciones') return Response.json(options.orgExists===false?[]:[{id_organizacion:org,id_pais:country,nombre:'Organización prueba'}]);
      if(path==='puede_gestionar_donaciones') return Response.json(options.allowed!==false);
      if(path==='paises') return Response.json(options.countryExists===false?[]:[{id_pais:country}]);
      if(path==='programas') return Response.json(options.programExists===false?[]:[{id_programa:program}]);
      if(path==='archivar_donacion_segura') {
        if(options.persistCode) return Response.json({code:options.persistCode},{status:400});
        const row=rows.find(r=>r.id_donacion===body.p_id);
        if(row.version!==body.p_version) return Response.json({code:'40001'},{status:409});
        row.archived_at='2026-10-21T11:00:00Z'; row.version++; return new Response(null,{status:204});
      }
      if(path==='donaciones') {
        if(method==='POST') {
          if(options.persistCode) return Response.json({code:options.persistCode},{status:400});
          const row={...body,id_donacion:other,version:1};rows.push(row);return Response.json([row],{status:201});
        }
        const found=rows.filter(r=>(!u.searchParams.has('id_donacion')||u.searchParams.get('id_donacion')===`eq.${r.id_donacion}`)
          &&(!u.searchParams.has('id_organizacion')||u.searchParams.get('id_organizacion')===`eq.${r.id_organizacion}`)&&!r.archived_at);
        if(method==='PATCH') {
          if(options.persistCode) return Response.json({code:options.persistCode},{status:400});
          if(options.conflict||!found[0]||u.searchParams.get('version')!==`eq.${found[0].version}`) return Response.json([]);
          Object.assign(found[0],body,{version:found[0].version+1});
        }
        return Response.json(found);
      }
      throw new Error('Unexpected database request');
    }});
  const server=createOrganizationsServer(createOrganizationsApplication(repository));
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('No server');
  return {rows,calls,
    async send(path:string,method='GET',body?:unknown,authorized=true){
      const response=await fetch(`http://127.0.0.1:${address.port}/v1${path}`,{method,
        headers:{'content-type':'application/json',...(authorized?{authorization:'Bearer test-session'}:{})},
        ...(body===undefined?{}:{body:JSON.stringify(body)})});
      return {status:response.status,body:await response.json()};
    },
    close:()=>new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())),
  };
}
const mutationCount=(a:Awaited<ReturnType<typeof api>>)=>a.calls.filter(c=>c.path==='donaciones'&&c.method!=='GET'||c.path==='archivar_donacion_segura').length;

test('HTTP: registra, lista global/por Organización y consulta por ID',async()=>{
  const a=await api();try{
    const created=await a.send(`/organizations/${org}/donations`,'POST',{...valid,id_programa:program});
    assert.equal(created.status,201);assert.equal(created.body.data.donation.id_donacion,other);
    for(const path of ['/donations',`/organizations/${org}/donations`,`/donations/${other}`,`/organizations/${org}/donations/${other}`]) {
      const result=await a.send(path);assert.equal(result.status,200);
    }
    assert.equal(a.calls.find(c=>c.path==='programas')?.params.get('id_programa'),`eq.${program}`);
  }finally{await a.close();}
});
test('HTTP: creación directa exige Organización receptora',async()=>{
  const a=await api();try{
    assert.equal((await a.send('/donations','POST',valid)).status,400);
    assert.equal((await a.send('/donations','POST',{...valid,id_organizacion:org})).status,201);
  }finally{await a.close();}
});
test('HTTP: fecha imposible rechazada antes de consultar Supabase con errores por campo',async()=>{
  const a=await api();try{
    const result=await a.send(`/organizations/${org}/donations`,'POST',{...valid,fecha:'2026-02-30'});
    assert.equal(result.status,400);assert.ok(result.body.error.fields.fecha);assert.equal(a.calls.length,0);
  }finally{await a.close();}
});
for(const [options,changes,status,code] of [
  [{orgExists:false},{},404,'NO_ENCONTRADA'],[{countryExists:false},{},404,'PAIS_NO_EXISTE'],
  [{},{id_pais:other},409,'RELACION_INVALIDA'],[{},{id_organizacion:other},409,'RELACION_INVALIDA'],
  [{programExists:false},{id_programa:program},404,'PROGRAMA_NO_EXISTE'],
  [{allowed:false},{},403,'SIN_PERMISO'],[{invalidSession:true},{},401,'SIN_PERMISO'],
  [{network:true},{},503,'SUPABASE_NO_DISPONIBLE'],
] as const) {
  test(`HTTP: creación controla ${code} ${JSON.stringify(options)} ${JSON.stringify(changes)}`,async()=>{
    const a=await api(options);try{
      const result=await a.send(`/organizations/${org}/donations`,'POST',{...valid,...changes});
      assert.equal(result.status,status);assert.equal(result.body.error.code,code);assert.equal(mutationCount(a),0);
    }finally{await a.close();}
  });
}
test('HTTP: exige sesión en todas las operaciones',async()=>{
  const a=await api();try{
    for(const [path,method,body] of [[`/donations`,'GET',undefined],[`/organizations/${org}/donations`,'POST',valid],
      [`/donations/${id}`,'PATCH',{version_esperada:1,cambios:{estado:'Recibida'}}],
      [`/donations/${id}`,'DELETE',{version_esperada:1}]] as const) assert.equal((await a.send(path,method,body,false)).status,401);
    assert.equal(a.calls.length,0);
  }finally{await a.close();}
});
test('HTTP: distingue ID inválido, donación inexistente y Organización ajena',async()=>{
  const a=await api();try{
    assert.equal((await a.send('/donations/no-uuid')).status,400);
    assert.equal((await a.send(`/donations/${other}`)).status,404);
    assert.equal((await a.send(`/organizations/${other}/donations/${id}`)).status,404);
    assert.equal((await a.send(`/donations/${other}`,'PATCH',{version_esperada:1,cambios:{descripcion:'Nueva'}})).status,404);
  }finally{await a.close();}
});
test('HTTP: avanza estados con versión, mantiene identidad y archiva sin DELETE físico',async()=>{
  const a=await api();try{
    for(let i=1;i<4;i++) {
      const path=i%2?`/organizations/${org}/donations/${id}`:`/donations/${id}`;
      const result=await a.send(path,'PATCH',{version_esperada:i,cambios:{estado:ESTADOS_DONACION[i]}});
      assert.equal(result.status,200);assert.equal(result.body.data.donation.version,i+1);
    }
    assert.equal((await a.send(`/donations/${id}`,'DELETE',{version_esperada:4})).status,200);
    assert.equal((await a.send(`/donations/${id}`)).status,404);
    assert.ok(a.calls.some(c=>c.path==='archivar_donacion_segura'));
    assert.ok(a.calls.every(c=>c.method!=='DELETE'));
  }finally{await a.close();}
});
for(const [options,input,status,code] of [
  [{},{version_esperada:1,cambios:{estado:'Entregada'}},409,'TRANSICION_NO_PERMITIDA'],
  [{},{version_esperada:2,cambios:{estado:'Recibida'}},409,'CONFLICTO_CONCURRENCIA'],
  [{allowed:false},{version_esperada:1,cambios:{estado:'Recibida'}},403,'SIN_PERMISO'],
  [{},{version_esperada:1,cambios:{unidad:null}},400,'DATOS_INVALIDOS'],
  [{},{version_esperada:1,cambios:{valor_estimado:null}},400,'DATOS_INVALIDOS'],
  [{},{version_esperada:1,cambios:{id_programa:program}},200,null],
  [{programExists:false},{version_esperada:1,cambios:{id_programa:program}},404,'PROGRAMA_NO_EXISTE'],
] as const) {
  test(`HTTP: modificación controla ${code??'Programa global'} ${JSON.stringify(input)}`,async()=>{
    const a=await api(options);try{
      const result=await a.send(`/donations/${id}`,'PATCH',input);
      assert.equal(result.status,status);if(code)assert.equal(result.body.error.code,code);
      if(status!==200)assert.equal(mutationCount(a),0);
    }finally{await a.close();}
  });
}
test('HTTP: detecta concurrencia entre lectura y escritura',async()=>{
  const a=await api({conflict:true});try{
    const result=await a.send(`/donations/${id}`,'PATCH',{version_esperada:1,cambios:{estado:'Recibida'}});
    assert.equal(result.status,409);assert.equal(a.calls.find(c=>c.method==='PATCH')?.params.get('version'),'eq.1');
  }finally{await a.close();}
});
for(const [dbCode,status,code] of [['23503',409,'RELACION_INVALIDA'],['23514',400,'DATOS_INVALIDOS'],
  ['42501',403,'SIN_PERMISO'],['40001',409,'CONFLICTO_CONCURRENCIA'],['XX000',502,'ERROR_BASE_DATOS'],
  ['PGRST202',503,'MIGRACION_PENDIENTE']]) {
  test(`HTTP: traduce persistencia ${dbCode}`,async()=>{
    const a=await api({persistCode:dbCode});try{
      const result=await a.send(`/organizations/${org}/donations`,'POST',valid);
      assert.equal(result.status,status);assert.equal(result.body.error.code,code);
      assert.equal(result.body.data,null);assert.ok(result.body.error.requestId);
    }finally{await a.close();}
  });
}
test('HTTP: archivado exige permiso y versión vigente',async()=>{
  for(const options of [{allowed:false},{}]){
    const a=await api(options);try{
      const result=await a.send(`/organizations/${org}/donations/${id}`,'DELETE',{version_esperada:2});
      assert.equal(result.status,options.allowed===false?403:409);
      if(options.allowed===false)assert.equal(mutationCount(a),0);
    }finally{await a.close();}
  }
});
