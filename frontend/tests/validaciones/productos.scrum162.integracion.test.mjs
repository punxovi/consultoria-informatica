import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { crearBaseProgramas, usuarios } from '../helpers/programas-db.mjs';
import { createProductsApplication } from '../../../backend/services/organizations/src/application/products-service.ts';
import { createPublicCatalogApplication } from '../../../backend/services/organizations/src/application/public-catalog-service.ts';
import { createOrganizationsServer } from '../../../backend/services/organizations/src/server.ts';
import { createGatewayServer } from '../../../backend/gateway/src/server.ts';

test('SCRUM-162: HTTP → Gateway → servicio → SQL real, regresión de los cuatro hallazgos QA', async t => {
  const db=await crearBaseProgramas();const servers=[];
  const org=randomUUID(),otherOrg=randomUUID(),country=randomUUID(),otherCountry=randomUUID();
  let id,version;
  const requests=[];
  const listen=async server=>{servers.push(server);await new Promise(r=>server.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${server.address().port}`;};
  try {
    await db.exec(`ALTER TABLE storage.buckets ADD COLUMN public boolean NOT NULL DEFAULT false;
      INSERT INTO storage.buckets(id) VALUES('fge-archivos');`);
    for(const migration of ['20260909000848_fge_catalogo_cotizaciones.sql',
      '20260928220437_fge_reparar_acceso_api_programas.sql',
      '20260916221136_organizaciones_datos_parciales_20260916.sql','20261002120000_fge_reforzar_rls_planes_acciones.sql',
      '20261004185000_fge_rls_organizaciones.sql','20261004185001_fge_permisos_organizaciones.sql',
      '20261023150000_fge_paises_catalogo_dashboard.sql','20261103150000_fge_scrum161_catalogo_productos.sql']) {
      await db.exec(await readFile(new URL('../../../supabase/migrations/'+migration,import.meta.url),'utf8'));
    }
    await db.exec('CREATE ROLE service_role;');
    await db.exec(await readFile(new URL('../../../supabase/migrations/20261105180000_fge_catalogo_publico_imagenes.sql',import.meta.url),'utf8'));
    await db.query(`INSERT INTO public.paises(id_pais,nombre,codigo_iso) VALUES($1,'Chile','CL'),($2,'Argentina','AR')`,[country,otherCountry]);
    await db.query(`INSERT INTO public.organizaciones(id_organizacion,id_pais,nombre,nombre_representante,telefono,publico_objetivo,descripcion_breve)
      VALUES($1,$3,'Organización QA','Persona','123','Comunidad','QA'),($2,$4,'Otra Organización','Persona','123','Comunidad','QA')`,[org,otherOrg,country,otherCountry]);
    const historical=(await db.query(`INSERT INTO public.productos(id_organizacion,nombre,descripcion,unidad_medida,material_terminacion)
      VALUES($1,'Histórico','Descripción','unidad','Madera · terminación sin separación fiable') RETURNING *`,[org])).rows[0];
    await db.exec(await readFile(new URL('../../../supabase/migrations/20261109120000_fge_scrum162_correcciones_qa.sql',import.meta.url),'utf8'));
    const migrated=(await db.query('SELECT * FROM public.productos WHERE id_producto=$1',[historical.id_producto])).rows[0];
    assert.equal(migrated.material,historical.material_terminacion);assert.equal(migrated.terminacion,null);
    assert.equal(migrated.id_organizacion,historical.id_organizacion);

    const fetchImpl=async(input,init={})=>{
      const url=new URL(String(input)),table=url.pathname.split('/').pop();
      const token=new Headers(init.headers).get('authorization')?.replace(/^Bearer /,'');
      const actor=token==='qa-admin'?usuarios.ADMIN:token==='qa-coord'?usuarios.COORD:null;
      requests.push({url,method:init.method??'GET',body:init.body});
      if(table==='get_user_roles') return Response.json(actor?[{codigo:token==='qa-admin'?'ADMIN':'COORD'}]:[],{status:actor?200:401});
      if(!['productos','organizaciones','paises','archivos','catalogo_cotizacion_publico'].includes(table)) throw new Error('Ruta no prevista '+table);
      try {
        const rows=await db.transaction(async tx=>{
          if(table==='catalogo_cotizacion_publico') await tx.exec('SET LOCAL ROLE anon');
          else {await tx.exec('SET LOCAL ROLE authenticated');await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor??'']);}
          const values=[],clauses=[];
          for(const key of ['id_producto','id_organizacion','id_pais','version','categoria','estado_carga','archived_at']) {
            const filter=url.searchParams.get(key);if(!filter)continue;
            if(filter==='is.null'){clauses.push(`${key} IS NULL`);continue;}
            if(filter.startsWith('in.(')){const ids=filter.slice(4,-1).split(',');values.push(ids);clauses.push(`${key}=ANY($${values.length}::uuid[])`);continue;}
            assert.ok(filter.startsWith('eq.'));values.push(filter.slice(3));clauses.push(`${key}=$${values.length}`);
          }
          if(table==='catalogo_cotizacion_publico') {
            for(const [filter,sql] of [['organizacion->>id_organizacion',"organizacion->>'id_organizacion'"],['organizacion->pais->>id_pais',"organizacion->'pais'->>'id_pais'"]]) {
              const value=url.searchParams.get(filter);if(value){assert.ok(value.startsWith('eq.'));values.push(value.slice(3));clauses.push(`${sql}=$${values.length}`);}
            }
          }
          const where=clauses.length?' WHERE '+clauses.join(' AND '):'';
          if((init.method??'GET')==='GET') return (await tx.query(`SELECT * FROM public.${table}${where}${table==='catalogo_cotizacion_publico'?' ORDER BY nombre,id_producto LIMIT 2':''}`,values)).rows;
          const body=JSON.parse(init.body);const keys=Object.keys(body);
          assert.ok(keys.every(key=>/^[a-z_]+$/.test(key)));
          if(init.method==='POST')return(await tx.query(`INSERT INTO public.${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(body).map(v=>v&&typeof v==='object'?JSON.stringify(v):v))).rows;
          const set=keys.map(key=>{values.push(body[key]&&typeof body[key]==='object'?JSON.stringify(body[key]):body[key]);return `${key}=$${values.length}`;}).join(',');
          return(await tx.query(`UPDATE public.${table} SET ${set}${where} RETURNING *`,values)).rows;
        });
        return Response.json(rows.map(r=>({...r,...(r.version!==undefined?{version:Number(r.version)}:{})})));
      }catch(error){return Response.json({code:error.code,message:error.message},{status:error.code==='42501'?403:400});}
    };
    const options={supabaseUrl:'https://qa.invalid',anonKey:'qa-anon',fetchImpl};
    const service=await listen(createOrganizationsServer(undefined,undefined,undefined,undefined,createPublicCatalogApplication(options),createProductsApplication(options)));
    const gateway=await listen(createGatewayServer({targets:{organizations:new URL(service)}}));
    const api=async(path,{method='GET',body,token='qa-admin'}={})=>{
      const response=await fetch(gateway+'/api/v1/'+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
      return {status:response.status,body:await response.json()};
    };
    const patch=(changes,v=version,target=id)=>api('products/'+target,{method:'PATCH',body:{version_esperada:v,cambios:changes}});
    await t.test('alta y detalle protegidos con identificadores estables',async()=>{
      const result=await api('products',{method:'POST',body:{id_organizacion:org,nombre:'Bolso',descripcion:'Artesanal',unidad_medida:'unidad',material:'Algodón',terminacion:'Bordado'}});
      assert.equal(result.status,201,JSON.stringify(result.body));id=result.body.data.product.id_producto;version=result.body.data.product.version;
      const detail=await api('products/'+id);assert.equal(detail.status,200);assert.equal(detail.body.data.product.terminacion,'Bordado');
      assert.equal((await api('products/'+id,{token:null})).status,401);
      assert.equal((await api('products/'+id,{token:'qa-coord'})).status,403);
      assert.equal((await api('products/'+randomUUID())).status,404);
      assert.equal((await api('products/not-a-uuid')).status,400);
    });
    await t.test('PATCH rechaza nulos obligatorios, tipos, arrays, campos desconocidos y conserva registro',async()=>{
      const before=(await db.query('SELECT * FROM public.productos WHERE id_producto=$1',[id])).rows[0];
      for(const changes of [{nombre:null},{descripcion:null},{unidad_medida:null},{nombre:''},{categoria:4},{publicado:'true'},[],{}, {id_organizacion:otherOrg},{nombre:'Válido',stock:4},{caracteristicas:[]},{version:1}]) {
        const result=await patch(changes);assert.equal(result.status,400,JSON.stringify(changes));
      }
      for(const body of [null,[],{version_esperada:version,cambios:{nombre:'Otro'},extra:1},{version_esperada:'1',cambios:{nombre:'Otro'}}]) {
        assert.equal((await api('products/'+id,{method:'PATCH',body})).status,400);
      }
      assert.deepEqual((await db.query('SELECT * FROM public.productos WHERE id_producto=$1',[id])).rows[0],before);
    });
    await t.test('PATCH parcial conserva material/terminación, autoría, relaciones y campos adicionales',async()=>{
      let result=await patch({material:'Lino'});assert.equal(result.status,200);version=result.body.data.product.version;
      assert.equal(result.body.data.product.material,'Lino');assert.equal(result.body.data.product.terminacion,'Bordado');
      result=await patch({terminacion:'Teñido',categoria:null,caracteristicas:{color:'Azul'},informacion_adicional:'Lavado suave'});assert.equal(result.status,200);version=result.body.data.product.version;
      assert.equal(result.body.data.product.material,'Lino');assert.equal(result.body.data.product.terminacion,'Teñido');
      result=await patch({material:null});assert.equal(result.status,200);version=result.body.data.product.version;
      assert.equal(result.body.data.product.material,null);assert.equal(result.body.data.product.terminacion,'Teñido');
      const row=(await db.query('SELECT * FROM public.productos WHERE id_producto=$1',[id])).rows[0];
      assert.equal(row.id_organizacion,org);assert.equal(row.created_by,usuarios.ADMIN);assert.equal(row.material_terminacion,'Teñido');
      assert.deepEqual(row.caracteristicas,{color:'Azul'});assert.equal(row.informacion_adicional,'Lavado suave');
    });
    await t.test('inexistente/archivado devuelve 404 y versión antigua 409, sin escribir',async()=>{
      assert.equal((await patch({nombre:'No debe cambiar'},1)).status,409);
      const missing=await patch({nombre:'No existe'},1,randomUUID());assert.equal(missing.status,404);assert.equal(missing.body.error.code,'PRODUCTO_NO_ENCONTRADO');
      await db.query('UPDATE public.productos SET archived_at=now() WHERE id_producto=$1',[historical.id_producto]);
      assert.equal((await patch({nombre:'Archivado'},1,historical.id_producto)).status,404);
      assert.equal((await api('products/'+id)).body.data.product.nombre,'Bolso');
      const concurrent=await Promise.all([patch({descripcion:'Edición A'}),patch({descripcion:'Edición B'})]);
      assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
      version=concurrent.find(r=>r.status===200).body.data.product.version;
    });
    await t.test('activación/desactivación y Organización inexistente/inactiva',async()=>{
      const active=await patch({publicado:true});assert.equal(active.status,200);version=active.body.data.product.version;
      const disabled=await patch({publicado:false});assert.equal(disabled.status,200);version=disabled.body.data.product.version;
      for(const target of [randomUUID(),otherOrg]) {
        if(target===otherOrg)await db.query('UPDATE public.organizaciones SET archived_at=now() WHERE id_organizacion=$1',[otherOrg]);
        assert.equal((await api('products',{method:'POST',body:{id_organizacion:target,nombre:'Producto',descripcion:'QA',unidad_medida:'unidad'}})).status,400);
      }
      await db.query('UPDATE public.organizaciones SET archived_at=NULL WHERE id_organizacion=$1',[otherOrg]);
    });
    await t.test('filtros públicos individuales/combinados se aplican antes del límite SQL',async()=>{
      await db.query(`INSERT INTO public.productos(id_organizacion,nombre,descripcion,unidad_medida,publicado)
        SELECT $1,'AAA ajeno '||n,'Sin datos internos','unidad',true FROM generate_series(1,5) n`,[otherOrg]);
      await db.query(`UPDATE public.productos SET publicado=true WHERE id_producto=$1`,[id]);
      for(const filter of [`id_pais=${country}`,`id_organizacion=${org}`,`id_pais=${country}&id_organizacion=${org}`]) {
        const result=await api('public/catalog?'+filter,{token:null});assert.equal(result.status,200);assert.deepEqual(result.body.data.items.map(p=>p.id_producto),[id]);
        assert.equal('correo' in result.body.data.items[0].organizacion,false);
      }
      assert.deepEqual((await api(`public/catalog?id_pais=${otherCountry}&id_organizacion=${org}`,{token:null})).body.data.items,[]);
      for(const query of ['id_pais=mal','id_organizacion=','id_pais='+country+'&id_pais='+country,'foo=1'])assert.equal((await api('public/catalog?'+query,{token:null})).status,400);
      assert.ok(requests.some(r=>r.url.searchParams.has('organizacion->pais->>id_pais')));
    });
    await t.test('script remoto verifica persistencia y revierte sus datos de prueba',async()=>{
      const before=(await db.query('SELECT count(*)::int n FROM public.productos')).rows[0].n;
      await db.exec(await readFile(new URL('../../../supabase/checks/scrum162-correcciones-qa.sql',import.meta.url),'utf8'));
      assert.equal((await db.query('SELECT count(*)::int n FROM public.productos')).rows[0].n,before);
    });
  } finally {
    for(const server of servers.reverse()){server.closeAllConnections();await new Promise(r=>server.close(r));}
    await db.close();
  }
});
