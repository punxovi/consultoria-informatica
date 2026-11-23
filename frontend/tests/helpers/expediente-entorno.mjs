import { instalarAuditoriaRF62, esRpcAuditoria, ejecutarRpcAuditoria } from './auditoria-db.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, usuarios } from './programas-db.mjs';
import { createOrganizationsApplication } from '../../../backend/services/organizations/src/application/organizations-service.ts';
import { createSupabaseOrganizationsRepository } from '../../../backend/services/organizations/src/infrastructure/supabase-organizations.repository.ts';
import { createOrganizationsServer } from '../../../backend/services/organizations/src/server.ts';
import { createGatewayServer } from '../../../backend/gateway/src/server.ts';

export const camposLegales = {
  estado_personalidad_juridica: 'si',
  tipo_personalidad_juridica: 'Fundación',
  numero_registro: 'REG-2026-FGE',
  fecha_constitucion: '2020-05-15',
  vigencia_directiva: 'Vigente hasta 2028',
};

export async function crearEntornoExpediente({ origin = 'http://127.0.0.1:4334' } = {}) {
  const db = await crearBaseProgramas();
  const servidores = [];
  async function cerrar() {
    for (const servidor of servidores.reverse()) {
      servidor.closeAllConnections();
      await new Promise(resolve => servidor.close(resolve));
    }
    await db.close();
  }
  try {
    await db.exec(`
      ALTER TABLE storage.buckets ADD COLUMN name text;
      ALTER TABLE storage.buckets ADD COLUMN public boolean NOT NULL DEFAULT false;
    `);

    for (const nombre of [
      '20261002120000_fge_reforzar_rls_planes_acciones.sql',
      '20261004185000_fge_rls_organizaciones.sql',
      '20261004185001_fge_permisos_organizaciones.sql',
      '20261007120000_fge_expediente_legal.sql',
    ]) {
      await db.exec(await readFile(new URL('../../../supabase/migrations/' + nombre, import.meta.url), 'utf8'));
    }

    await instalarAuditoriaRF62(db);
    await db.exec("INSERT INTO public.paises(codigo_iso,nombre) VALUES ('CL','Chile'),('AR','Argentina') ON CONFLICT DO NOTHING");
    const paises = (await db.query('SELECT * FROM public.paises')).rows;
    const paisCL = paises.find(p => p.codigo_iso === 'CL');
    await db.query(`UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2`, [paisCL.id_pais, usuarios.COORD]);

    const sinRol = '17600000-0000-4000-8000-000000000003';
    await db.query('INSERT INTO auth.users VALUES ($1)', [sinRol]);
    await db.query("INSERT INTO public.perfiles(id_usuario,nombre) VALUES ($1,'Sin permisos')", [sinRol]);

    async function crearOrganizacion(codigo = 'CL') {
      const pais = paises.find(p => p.codigo_iso === codigo);
      return (await db.query(`INSERT INTO public.organizaciones (
        id_pais,nombre,nombre_representante,telefono,correo,region_departamento,
        comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios
      ) VALUES ($1,'Org QA '||$2,'Representante QA','912345678','qa@example.invalid',
        'Región','Ciudad','Calle QA','Comunidad','Prueba de integración','centro_comunitario',20) RETURNING *`,
      [pais.id_pais, codigo])).rows[0];
    }

    const solicitudes = [];
    const ids = { 'qa-admin': usuarios.ADMIN, 'qa-coord': usuarios.COORD, 'qa-sin-rol': sinRol };

    async function escuchar(servidor) {
      servidores.push(servidor);
      await new Promise((resolve, reject) => { servidor.once('error', reject); servidor.listen(0, '127.0.0.1', resolve); });
      return `http://127.0.0.1:${servidor.address().port}`;
    }

    const storageObjects = new Map();

    const supabase = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://test.local');
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info');
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');

      const responder = (status, data) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(data));
      };

      if (req.method === 'OPTIONS') return responder(200, {});

      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const user = ids[token];
      if (!user) return responder(401, { code: '42501', message: 'Sesión requerida' });

      if (url.pathname.startsWith('/storage/v1/object/fge-expedientes-legales/')) {
        const rutaObjeto = url.pathname.replace('/storage/v1/object/fge-expedientes-legales/', '');
        if (req.method === 'POST') {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          storageObjects.set(rutaObjeto, Buffer.concat(chunks));
          return responder(200, { Key: `fge-expedientes-legales/${rutaObjeto}` });
        }
        if (req.method === 'DELETE') {
          storageObjects.delete(rutaObjeto);
          return responder(200, { message: 'Deleted' });
        }
      }

      try {
        let texto = '';
        for await (const chunk of req) texto += chunk;
        const entrada = texto ? JSON.parse(texto) : null;
        if(esRpcAuditoria(url.pathname))return responder(200,await ejecutarRpcAuditoria(db,user,url.pathname,entrada,req.headers));

        if (url.pathname === '/rest/v1/rpc/guardar_expediente_legal') {
          solicitudes.push({ ruta: 'guardar_expediente_legal', token, entrada });
          const idCreado = await db.transaction(async tx => {
            await tx.exec('SET LOCAL ROLE authenticated');
            await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
            const res = await tx.query(
              'SELECT public.guardar_expediente_legal($1::uuid, $2::jsonb, $3::bigint) AS id',
              [entrada.p_id_organizacion, JSON.stringify(entrada.p_datos), entrada.p_version_esperada ?? null]
            );
            return res.rows[0].id;
          });
          return responder(200, idCreado);
        }

        const tabla = url.pathname.split('/').pop();

        if (tabla === 'organizaciones') {
          solicitudes.push({ tabla, metodo: req.method, token, entrada });
          const idFiltro = url.searchParams.get('id_organizacion')?.replace('eq.', '');
          const res = await db.transaction(async tx => {
            await tx.exec('SET LOCAL ROLE authenticated');
            await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
            if (idFiltro) {
              return tx.query('SELECT * FROM public.organizaciones WHERE id_organizacion = $1 AND archived_at IS NULL', [idFiltro]);
            }
            return tx.query('SELECT * FROM public.organizaciones WHERE archived_at IS NULL');
          });
          const filas = res.rows.map(r => ({ ...r, pais: paises.find(p => p.id_pais === r.id_pais) }));
          return responder(200, filas);
        }

        if (tabla === 'informacion_legal') {
          solicitudes.push({ tabla, metodo: req.method, token, entrada });
          const orgFiltro = url.searchParams.get('id_organizacion')?.replace('eq.', '');
          const res = await db.transaction(async tx => {
            await tx.exec('SET LOCAL ROLE authenticated');
            await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
            const filaLegal = (await tx.query(
              'SELECT * FROM public.informacion_legal WHERE id_organizacion = $1 AND archived_at IS NULL LIMIT 1',
              [orgFiltro]
            )).rows[0];

            if (!filaLegal) return [];

            const docs = (await tx.query(
              `SELECT d.id_documento_legal, d.tipo, d.estado,
                      json_build_object('nombre_original', a.nombre_original) AS archivo
               FROM public.documentos_informacion_legal d
               LEFT JOIN public.archivos a ON a.id_archivo = d.id_archivo
               WHERE d.id_informacion_legal = $1`,
              [filaLegal.id_informacion_legal]
            )).rows;

            return [{
              id_informacion_legal: filaLegal.id_informacion_legal,
              id_organizacion: filaLegal.id_organizacion,
              estado_personalidad_juridica: filaLegal.estado_personalidad_juridica,
              tipo_personalidad_juridica: filaLegal.tipo_personalidad_juridica,
              numero_registro: filaLegal.numero_registro,
              fecha_constitucion: filaLegal.fecha_constitucion ? new Date(filaLegal.fecha_constitucion).toISOString().slice(0, 10) : '',
              vigencia_directiva: filaLegal.vigencia_directiva,
              version: Number(filaLegal.version),
              updated_at: new Date(filaLegal.updated_at).toISOString(),
              documentos: docs,
            }];
          });
          return responder(200, res);
        }

        return responder(404, { message: 'Ruta no implementada en mock' });
      } catch (error) {
        return responder(error.code === '42501' ? 403 : 400, { code: error.code, message: error.message });
      }
    });

    const supabaseUrl = await escuchar(supabase);
    const repository = createSupabaseOrganizationsRepository({ supabaseUrl, anonKey: 'qa-anon' });
    const serviceUrl = await escuchar(createOrganizationsServer(createOrganizationsApplication(repository)));
    const gatewayUrl = await escuchar(createGatewayServer({
      allowedOrigins: [origin],
      targets: { organizations: new URL(serviceUrl) },
    }));

    return {
      db,
      supabaseUrl,
      serviceUrl,
      gatewayUrl,
      solicitudes,
      crearOrganizacion,
      cerrar,
      usuarios: { ...usuarios, SIN_ROL: sinRol },
    };
  } catch (error) {
    await cerrar();
    throw error;
  }
}
