import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { crearEntornoDiagnostico } from './diagnostico-entorno.mjs';
import { createInterventionsServer } from '../../../backend/services/interventions/src/server.ts';
import { createInterventionsApplication } from '../../../backend/services/interventions/src/application/interventions-service.ts';
import { createSupabaseInterventionsRepositories } from '../../../backend/services/interventions/src/infrastructure/supabase-interventions.repository.ts';
import { createGatewayServer } from '../../../backend/gateway/src/server.ts';
import { createOrganizationsServer } from '../../../backend/services/organizations/src/server.ts';
import { createOrganizationsApplication } from '../../../backend/services/organizations/src/application/organizations-service.ts';
import { createSupabaseOrganizationsRepository } from '../../../backend/services/organizations/src/infrastructure/supabase-organizations.repository.ts';

export async function crearEntornoActas({ origin = 'http://127.0.0.1:4333' } = {}) {
  const base = await crearEntornoDiagnostico({ origin });
  const { db } = base;
  const servidores = [], solicitudes = [];
  async function cerrar() {
    for (const s of servidores.reverse()) { s.closeAllConnections(); await new Promise(r => s.close(r)); }
    await base.cerrar();
  }
  try {
    for (const nombre of ['20261008140000_fge_actas_api.sql','20261010120000_fge_actas_integracion.sql','20261010140000_fge_compromisos_integracion.sql']) {
      await db.exec(await readFile(new URL('../../../supabase/migrations/' + nombre, import.meta.url),'utf8'));
    }
    async function fixture(pais = 'CL', conPlan = true) {
      const organizacion = await base.crearOrganizacion(pais);
      if (!conPlan) return { organizacion, planes: [], acciones: [] };
      const programa = (await db.query("INSERT INTO public.programas(nombre,descripcion,objetivo_general,objetivos_especificos,componentes_linea_accion,resultados_esperados) VALUES ('Programa QA','Descripción','Objetivo','Objetivos','Componente','Resultado') RETURNING *")).rows[0];
      const planes = [], acciones = [];
      for (const nombre of ['Apoyo comunitario', 'Fortalecimiento institucional']) {
        const plan = (await db.query(`INSERT INTO public.planes(id_organizacion,id_programa,nombre,situacion_necesidad,objetivo_general,objetivos_especificos,resultado_esperado,responsable_nombre,fecha_inicio,fecha_termino,periodo_anual)
          VALUES($1,$2,$3,'Necesidad','Objetivo','Objetivos','Resultado','QA','2026-01-01','2026-12-31',2026) RETURNING *`, [organizacion.id_organizacion,programa.id_programa,nombre])).rows[0];
        planes.push(plan);
        acciones.push((await db.query(`INSERT INTO public.acciones(id_plan,nombre,responsable_nombre,fecha_inicio,fecha_termino)
          VALUES($1,$2,'QA','2026-01-01','2026-12-31') RETURNING *`,[plan.id_plan,`Acción de ${nombre}`])).rows[0]);
      }
      return { organizacion, planes, acciones };
    }
    async function como(token, fn) {
      const usuario = { 'qa-admin': base.usuarios.ADMIN, 'qa-coord': base.usuarios.COORD, 'qa-sin-rol': base.usuarios.SIN_ROL }[token];
      if (!usuario) throw Object.assign(new Error('Sesión inválida'),{ code:'42501' });
      return db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE authenticated');
        await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[usuario]);
        return fn(tx);
      });
    }
    function normalizar(fila) {
      return { ...fila, version: Number(fila.version),
        ...(fila.fecha_reunion ? { fecha_reunion: new Date(fila.fecha_reunion).toISOString().slice(0,10) } : {}),
        ...(fila.fecha_limite ? { fecha_limite: new Date(fila.fecha_limite).toISOString().slice(0,10) } : {}),
      };
    }
    const supabase = createServer(async(req,res) => {
      const url = new URL(req.url,'http://qa.local');
      const responder = (status, data) => { res.writeHead(status,{'content-type':'application/json'}); res.end(JSON.stringify(data)); };
      res.setHeader('access-control-allow-origin',origin);
      res.setHeader('access-control-allow-headers',req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info');
      res.setHeader('access-control-allow-methods','GET,POST,PATCH,OPTIONS');
      if(req.method === 'OPTIONS') return responder(200,{});
      const token = req.headers.authorization?.replace(/^Bearer /,'');
      let raw = ''; for await (const chunk of req) raw += chunk;
      try {
        if (url.pathname === '/auth/v1/user') {
          const id = { 'qa-admin': base.usuarios.ADMIN, 'qa-coord': base.usuarios.COORD }[token];
          return id
            ? responder(200, { id, email: 'qa@example.invalid', user_metadata: {} })
            : responder(401, { message: 'Sesión inválida' });
        }
        if (url.pathname === '/__qa/fixture' && token === 'qa-admin') {
          const entrada = raw ? JSON.parse(raw) : {};
          return responder(201,await fixture(entrada.pais,entrada.conPlan));
        }
        const tabla = url.pathname.split('/').pop();
        if (!['actas','planes','acciones','catalogo_actas','crear_acta_completa','consultar_compromisos','catalogo_compromisos','guardar_compromiso'].includes(tabla)) {
          const r = await fetch(`${base.supabaseUrl}${req.url}`,{ method:req.method, headers:{ authorization:req.headers.authorization,'content-type':'application/json' }, ...(raw ? { body:raw } : {}) });
          return responder(r.status,await r.json());
        }
        const entrada = raw ? JSON.parse(raw) : null;
        solicitudes.push({ ruta:url.pathname, metodo:req.method, params:url.searchParams, token, entrada });
        const result = await como(token,async tx => {
          if(tabla === 'catalogo_compromisos') return (await tx.query('SELECT public.catalogo_compromisos($1) AS valor',[entrada.p_id_organizacion])).rows[0].valor;
          if(tabla === 'consultar_compromisos') return (await tx.query('SELECT public.consultar_compromisos($1,$2,$3) AS valor',[entrada.p_id_organizacion,entrada.p_id ?? null,entrada.p_id_acta ?? null])).rows[0].valor;
          if(tabla === 'guardar_compromiso') return (await tx.query('SELECT public.guardar_compromiso($1,$2::jsonb,$3,$4) AS valor',[entrada.p_id_organizacion,JSON.stringify(entrada.p_datos),entrada.p_id ?? null,entrada.p_version ?? null])).rows[0].valor;
          if(tabla === 'catalogo_actas') return (await tx.query('SELECT public.catalogo_actas($1::uuid) AS valor',[entrada.p_id_organizacion])).rows[0].valor;
          if(tabla === 'crear_acta_completa') return (await tx.query('SELECT public.crear_acta_completa($1::jsonb,$2::jsonb) AS valor',[JSON.stringify(entrada.p_datos),JSON.stringify(entrada.p_compromisos)])).rows[0].valor;
          const valores = [], filtros = [];
          for(const c of ['id_organizacion','id_plan','id_accion','id_acta','version']) {
            const f = url.searchParams.get(c); if(f) { if(!f.startsWith('eq.')) throw new Error('Filtro no implementado'); valores.push(f.slice(3)); filtros.push(`${c}=$${valores.length}`); }
          }
          if(url.searchParams.get('archived_at') === 'is.null') filtros.push('archived_at IS NULL');
          const where = filtros.length ? ` WHERE ${filtros.join(' AND ')}` : '';
          let rows;
          if(req.method === 'GET') rows = (await tx.query(`SELECT * FROM public.${tabla}${where}`,valores)).rows;
          else {
            if(tabla !== 'actas') throw new Error('Escritura no implementada');
            const cols = Object.keys(entrada);
            if(cols.some(c => !['id_organizacion','id_plan','id_accion','fecha_reunion','objetivo','asistentes','asistentes_externos','observaciones'].includes(c))) throw new Error('Columna no implementada');
            if(req.method === 'POST') rows = (await tx.query(`INSERT INTO public.actas(${cols.join(',')}) VALUES(${cols.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,Object.values(entrada))).rows;
            else if(req.method === 'PATCH') {
              const set = cols.map(c => { valores.push(entrada[c]); return `${c}=$${valores.length}`; });
              rows = (await tx.query(`UPDATE public.actas SET ${set.join(',')}${where} RETURNING *`,valores)).rows;
            } else throw new Error('Método no implementado');
          }
          for(const fila of rows) if(tabla === 'actas') fila.compromisos = (await tx.query('SELECT * FROM public.compromisos WHERE id_acta=$1 AND archived_at IS NULL ORDER BY created_at,id_compromiso',[fila.id_acta])).rows.map(normalizar);
          return rows.map(normalizar);
        });
        responder(req.method === 'POST' && tabla === 'actas' ? 201 : 200,result);
      } catch(error) { responder(error.code === '42501' ? 403 : 400,{ code:error.code,message:error.message }); }
    });
    async function escuchar(s) {
      servidores.push(s);
      await new Promise((resolve,reject) => { s.once('error',reject); s.listen(0,'127.0.0.1',resolve); });
      return `http://127.0.0.1:${s.address().port}`;
    }
    const supabaseUrl = await escuchar(supabase);
    const repos = createSupabaseInterventionsRepositories({ supabaseUrl,anonKey:'qa-anon' });
    const serviceUrl = await escuchar(createInterventionsServer(createInterventionsApplication(repos.plans,repos.actions,repos.meetingMinutes)));
    const orgServiceUrl = await escuchar(createOrganizationsServer(createOrganizationsApplication(createSupabaseOrganizationsRepository({supabaseUrl,anonKey:'qa-anon'}))));
    const gatewayUrl = await escuchar(createGatewayServer({ allowedOrigins:[origin],targets:{ organizations:new URL(orgServiceUrl),interventions:new URL(serviceUrl) } }));
    return { db,fixture,como,supabaseUrl,gatewayUrl,solicitudes,cerrar,usuarios:base.usuarios };
  } catch(error) { await cerrar(); throw error; }
}
