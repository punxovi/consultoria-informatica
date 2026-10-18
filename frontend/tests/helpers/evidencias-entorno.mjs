// HTTP/Gateway/Backend reales; adaptador Auth/PostgREST/Storage de pruebas sobre PGlite.
// No sustituye la verificación adicional contra una instancia Supabase.
import { createSupabaseIndicatorsRepository } from '../../../backend/services/interventions/src/infrastructure/supabase-indicators.repository.ts';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, usuarios } from './programas-db.mjs';
import { createGatewayServer } from '../../../backend/gateway/src/server.ts';
import { createInterventionsServer } from '../../../backend/services/interventions/src/server.ts';
import { createInterventionsApplication } from '../../../backend/services/interventions/src/application/interventions-service.ts';
import { createSupabaseInterventionsRepositories } from '../../../backend/services/interventions/src/infrastructure/supabase-interventions.repository.ts';
import { createSupabaseEvidencesRepository } from '../../../backend/services/interventions/src/infrastructure/supabase-evidences.repository.ts';
import { createSupabasePublicEvidencesRepository } from '../../../backend/services/interventions/src/infrastructure/supabase-public-evidences.repository.ts';
import { createAuthServer } from '../../../backend/services/auth/src/server.ts';
import { createAuthApplication } from '../../../backend/services/auth/src/application/auth-service.ts';
import { createSupabaseAuthRepository } from '../../../backend/services/auth/src/infrastructure/supabase-auth.repository.ts';

export async function crearEntornoEvidencias({ origin = 'http://127.0.0.1:4335', indicadores = false } = {}) {
  const db = await crearBaseProgramas();
  const servers = [], solicitudes = [], objetos = new Map();
  let fallarConfirmacion = false;
  async function cerrar() {
    for (const server of servers.reverse()) { server.closeAllConnections(); await new Promise(r => server.close(r)); }
    await db.close();
  }
  async function escuchar(server) {
    servers.push(server);
    await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
    return `http://127.0.0.1:${server.address().port}`;
  }
  try {
    await db.exec(`CREATE ROLE service_role BYPASSRLS;
      ALTER TABLE storage.buckets ADD COLUMN name text, ADD COLUMN public boolean DEFAULT false;
      ALTER TABLE storage.objects ADD COLUMN metadata jsonb;
      ALTER TABLE storage.objects ALTER COLUMN id SET DEFAULT gen_random_uuid();
      CREATE UNIQUE INDEX objetos_ruta_uq ON storage.objects(bucket_id,name);
      GRANT USAGE ON SCHEMA storage TO authenticated,anon;
      GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
      -- Permiso del adaptador Storage; los permisos de public vienen de las migraciones.
      GRANT SELECT ON storage.objects TO service_role;`);
    for (const name of ['20261002120000_fge_reforzar_rls_planes_acciones.sql','20261013120000_fge_evidencias.sql','20261016120000_fge_publicacion_evidencias.sql','20261016130000_fge_permisos_publicacion_evidencias.sql']) {
      await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));
    }
    if (indicadores) for (const name of ['20261015120000_fge_tabla_indicadores.sql','20261015120100_fge_tabla_resultados.sql','20261015130000_fge_sprint6_rls.sql','20261017120000_fge_indicadores_integracion.sql']) {
      await db.exec(await readFile(new URL('../../../supabase/migrations/'+name,import.meta.url),'utf8'));
    }
    await db.exec(`INSERT INTO public.paises(codigo_iso,nombre) VALUES ('CL','Chile'),('AR','Argentina') ON CONFLICT DO NOTHING;`);
    const paises=(await db.query('SELECT * FROM public.paises')).rows;
    await db.query("UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2",[paises.find(p=>p.codigo_iso==='CL').id_pais,usuarios.COORD]);
    const sinRol='17600000-0000-4000-8000-000000000003';
    await db.query('INSERT INTO auth.users VALUES ($1)',[sinRol]);
    await db.query("INSERT INTO public.perfiles(id_usuario,nombre) VALUES ($1,'Sin rol QA')",[sinRol]);
    const ids={'qa-admin':usuarios.ADMIN,'qa-coord':usuarios.COORD,'qa-sin-rol':sinRol};
    async function como(token,fn) {
      return db.transaction(async tx => {
        if(token==='qa-publication') await tx.exec('SET LOCAL ROLE service_role');
        else {
          if(!ids[token]) throw Object.assign(new Error('Sesión requerida'),{code:'42501'});
          await tx.exec('SET LOCAL ROLE authenticated');
          await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[ids[token]]);
        }
        return fn(tx);
      });
    }
    function normalizar(row) {
      return Object.fromEntries(Object.entries(row).map(([key,value]) => [key,
        typeof value==='bigint'?Number(value):value instanceof Date?(key.startsWith('fecha_')?value.toISOString().slice(0,10):value.toISOString()):value]));
    }
    async function fixture(pais='CL') {
      const org=(await db.query(`INSERT INTO public.organizaciones
        (id_pais,nombre,nombre_representante,telefono,correo,region_departamento,comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios)
        VALUES($1,'Org Evidencias QA','QA','123456789','qa@example.invalid','Región','Ciudad','Calle','Comunidad','QA','centro_comunitario',10) RETURNING *`,[paises.find(p=>p.codigo_iso===pais).id_pais])).rows[0];
      const plan=(await db.query(`INSERT INTO public.planes
        (id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino,periodo_anual)
        SELECT $1,id_programa,'Plan Evidencias QA','Necesidad','Objetivo','Objetivos','Resultado','QA','2026-01-01','2026-12-31',2026
        FROM public.programas LIMIT 1 RETURNING *`,[org.id_organizacion])).rows[0];
      const action=(await db.query(`INSERT INTO public.acciones(id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino)
        VALUES($1,'Acción Evidencias QA','QA','2026-01-01','2026-12-31') RETURNING *`,[plan.id_plan])).rows[0];
      return { organizacion:normalizar(org),plan:normalizar(plan),accion:normalizar(action) };
    }
    const supabaseUrl=await escuchar(createServer(async(req,res) => {
      const url=new URL(req.url,'http://qa.local'), token=req.headers.authorization?.replace(/^Bearer /,'');
      const responder=(status,data)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(data));};
      res.setHeader('access-control-allow-origin',origin);
      res.setHeader('access-control-allow-headers',req.headers['access-control-request-headers']||'authorization,apikey,content-type,x-client-info');
      res.setHeader('access-control-allow-methods','GET,POST,PATCH,OPTIONS');
      if(req.method==='OPTIONS') return responder(200,{});
      const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks);
      solicitudes.push({path:url.pathname,method:req.method,token});
      try {
        if(url.pathname==='/__qa/fixture'&&token==='qa-admin')return responder(201,await fixture());
        if(url.pathname==='/auth/v1/user'&&ids[token])return responder(200,{id:ids[token],email:'qa@example.test',user_metadata:{}});
        if(url.pathname==='/rest/v1/rpc/get_user_roles')return responder(200,ids[token]&&token!=='qa-sin-rol'?[{codigo:token==='qa-admin'?'ADMIN':'COORD',alcance:'pais',id_pais:paises[0].id_pais}]:[]);
        if(url.pathname.startsWith('/storage/v1/object/')) {
          const path=url.pathname.replace('/storage/v1/object/','').replace(/^authenticated\//,'');
          if(path.startsWith('public/'))return responder(404,{code:'NoSuchKey'});
          const [bucket,...parts]=path.split('/'),name=parts.join('/');
          if(req.method==='POST') {
            if(objetos.has(path))return responder(400,{error:'Duplicate',statusCode:'409'});
            await como(token,tx=>tx.query('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)',[bucket,name,{size:bytes.length,mimetype:req.headers['content-type']}]));
            objetos.set(path,bytes);return responder(200,{Key:path});
          }
          const allowed=await como(token,tx=>tx.query('SELECT * FROM storage.objects WHERE bucket_id=$1 AND name=$2',[bucket,name]));
          if(!allowed.rows.length||!objetos.has(path))return responder(404,{code:'NoSuchKey'});
          res.writeHead(200,{'content-type':allowed.rows[0].metadata.mimetype});return res.end(objetos.get(path));
        }
        const input=bytes.length?JSON.parse(bytes.toString()):null;
        const table=url.pathname.split('/').at(-1);
        if(table==='obtener_archivo_evidencia_publicada')return responder(200,(await como(token,tx=>tx.query('SELECT * FROM public.obtener_archivo_evidencia_publicada($1)',[input.p_id]))).rows.map(normalizar));
        if(indicadores && url.pathname.startsWith('/rest/v1/rpc/')) {
          const functions={consultar_catalogo_indicadores:[],listar_indicadores_accion:['p_accion'],
            asociar_indicadores_accion:['p_accion','p_indicadores'],actualizar_meta_indicador:['p_id','p_version','p_meta'],
            guardar_resultado_indicador:['p_indicador','p_valor','p_fecha','p_observaciones','p_id','p_version'],
            archivar_indicador_seguro:['p_id','p_version']};
          if(!Object.hasOwn(functions,table)) return responder(404,{code:'PGRST202'});
          const args=functions[table].map(k=>k==='p_indicadores'?JSON.stringify(input[k]):input[k]??null);
          const placeholders=args.map((_,i)=>'$'+(i+1)).join(',');
          const result=await como(token,tx=>tx.query('SELECT public.'+table+'('+placeholders+') AS data',args));
          return responder(200,result.rows[0].data);
        }
        if(!['acciones','evidencias',...(indicadores?['indicadores','resultados']:[])].includes(table))return responder(404,{code:'NO_ENCONTRADA'});
        if(table==='evidencias'&&req.method==='PATCH'&&input.estado_carga==='disponible'&&fallarConfirmacion){fallarConfirmacion=false;return responder(503,{code:'QA_CONFIRMACION'});}
        const result=await como(token,async tx => {
          const values=[],filters=[];
          for(const key of ['id_accion','id_evidencia','version','id_indicador','id_resultado']) {
            const value=url.searchParams.get(key);
            if(value){if(!value.startsWith('eq.'))throw new Error('Filtro no soportado');values.push(value.slice(3));filters.push(`${key}=$${values.length}`);}
          }
          if(url.searchParams.get('archived_at')==='is.null')filters.push('archived_at IS NULL');
          const where=filters.length?` WHERE ${filters.join(' AND ')}`:'';
          let rows;
          if(req.method==='GET')rows=(await tx.query(`SELECT * FROM public.${table}${where}`,values)).rows;
          else {
            const keys=Object.keys(input);
            if(table!=='evidencias'||keys.some(k=>!['id_accion','origen','descripcion','nombre_original','mime_type','tamano_bytes','consentimiento_declarado','declaracion_consentimiento','estado_carga','estado_publicacion'].includes(k)))throw new Error('Escritura no soportada');
            if(req.method==='POST')rows=(await tx.query(`INSERT INTO public.evidencias(${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,Object.values(input))).rows;
            else if(req.method==='PATCH') {
              const set=keys.map(k=>{values.push(input[k]);return `${k}=$${values.length}`;});
              rows=(await tx.query(`UPDATE public.evidencias SET ${set.join(',')}${where} RETURNING *`,values)).rows;
            } else throw new Error('Método no soportado');
          }
          if(table==='acciones')for(const row of rows)row.plan=(await tx.query('SELECT id_plan,nombre FROM public.planes WHERE id_plan=$1',[row.id_plan])).rows[0];
          return rows.map(normalizar);
        });
        responder(req.method==='POST'?201:200,result);
      } catch(error){responder(error.code==='42501'?403:400,{code:error.code??'QA_ERROR',message:error.message});}
    }));
    const options={supabaseUrl,anonKey:'qa-anon'},repos=createSupabaseInterventionsRepositories(options);
    const serviceUrl=await escuchar(createInterventionsServer(
      createInterventionsApplication(repos.plans,repos.actions,repos.meetingMinutes,createSupabaseEvidencesRepository(options)),
      createSupabasePublicEvidencesRepository({supabaseUrl,publicationKey:'qa-publication'}),
      createSupabaseIndicatorsRepository(options)));
    const authUrl=await escuchar(createAuthServer({application:createAuthApplication(createSupabaseAuthRepository(options),origin)}));
    const gatewayUrl=await escuchar(createGatewayServer({allowedOrigins:[origin],targets:{interventions:new URL(serviceUrl),auth:new URL(authUrl)}}));
    return {db,fixture,como,supabaseUrl,gatewayUrl,solicitudes,objetos,cerrar,usuarios,
      fallarSiguienteConfirmacion(){fallarConfirmacion=true;}};
  } catch(error){await cerrar();throw error;}
}
