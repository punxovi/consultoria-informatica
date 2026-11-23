import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { crearBaseProgramas, usuarios } from './programas-db.mjs';
import { createOrganizationsApplication } from '../../../backend/services/organizations/src/application/organizations-service.ts';
import { createSupabaseOrganizationsRepository } from '../../../backend/services/organizations/src/infrastructure/supabase-organizations.repository.ts';
import { createOrganizationsServer } from '../../../backend/services/organizations/src/server.ts';
import { createGatewayServer } from '../../../backend/gateway/src/server.ts';

export const camposDiagnostico = {
  mision: 'Apoyar a la comunidad', vision: 'Una comunidad organizada', tiene_espacio_fisico: true,
  caracteristicas_infraestructura: 'Sede comunitaria', espacios_disponibles: 'Salón y cocina',
  recursos_existentes: 'Mesas y sillas', danos_detectados: 'Humedad en el techo',
  necesidades_prioritarias: 'Reparar el techo', observaciones: 'Visita inicial',
  raciones: 25, periodo_raciones: 'semanal',
};

export async function crearEntornoDiagnostico({ origin = 'http://127.0.0.1:4332' } = {}) {
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
    for (const nombre of [
      '20261002120000_fge_reforzar_rls_planes_acciones.sql',
      '20261004185000_fge_rls_organizaciones.sql',
      '20261004185001_fge_permisos_organizaciones.sql',
      '20261008000001_fge_tabla_diagnosticos.sql',
      '20261008120000_fge_diagnosticos.sql',
      '20261008121000_fge_actas_reunion.sql',
      '20261008122000_fge_sprint5_rls.sql',
      '20261009120000_fge_diagnosticos_api.sql',
    ]) await db.exec(await readFile(new URL('../../../supabase/migrations/' + nombre, import.meta.url), 'utf8'));
    await db.exec("INSERT INTO public.paises(codigo_iso,nombre) VALUES ('CL','Chile'),('AR','Argentina')");
    const paises = (await db.query('SELECT * FROM public.paises')).rows;
    const pais = paises.find(p => p.codigo_iso === 'CL');
    await db.query(`UPDATE public.asignaciones_roles SET alcance='pais',id_pais=$1 WHERE id_usuario=$2`, [pais.id_pais, usuarios.COORD]);
    const sinRol = '17600000-0000-4000-8000-000000000003';
    await db.query('INSERT INTO auth.users VALUES ($1)', [sinRol]);
    await db.query("INSERT INTO public.perfiles(id_usuario,nombre) VALUES ($1,'Sin permisos')", [sinRol]);

    async function crearOrganizacion(codigo = 'CL') {
      return (await db.query(`INSERT INTO public.organizaciones (
        id_pais,nombre,nombre_representante,telefono,correo,region_departamento,
        comuna_municipio_ciudad,direccion,publico_objetivo,descripcion_breve,tipo_organizacion,numero_beneficiarios
      ) VALUES ($1,'Organización Diagnóstico QA','Representante','912345678','qa@example.invalid',
        'Región','Ciudad','Calle QA','Comunidad','Prueba de integración','centro_comunitario',25) RETURNING *`,
      [paises.find(p => p.codigo_iso === codigo).id_pais])).rows[0];
    }
    const solicitudes = [];
    const ids = { 'qa-admin': usuarios.ADMIN, 'qa-coord': usuarios.COORD, 'qa-sin-rol': sinRol };
    async function escuchar(servidor) {
      servidores.push(servidor);
      await new Promise((resolve, reject) => { servidor.once('error', reject); servidor.listen(0, '127.0.0.1', resolve); });
      return `http://127.0.0.1:${servidor.address().port}`;
    }
    const supabase = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://test.local');
      res.setHeader('access-control-allow-origin', origin);
      res.setHeader('access-control-allow-headers', req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info');
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
      const responder = (status, data) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
      if (req.method === 'OPTIONS') return responder(200, {});
      const token = req.headers.authorization?.replace(/^Bearer /, '');
      const user = ids[token];
      if (!user) return responder(401, { code: '42501', message: 'Sesión requerida' });
      try {
        if (url.pathname === '/__qa/organization' && req.method === 'POST') return responder(201, await crearOrganizacion());
        if (url.pathname === '/rest/v1/rpc/get_user_roles') {
          return responder(200, token === 'qa-sin-rol' ? [] : [{ codigo: token === 'qa-admin' ? 'ADMIN' : 'COORD', alcance: 'pais', id_pais: pais.id_pais }]);
        }
        const tabla = url.pathname.split('/').pop();
        if (!['organizaciones', 'diagnosticos'].includes(tabla)) return responder(404, { message: 'Ruta de prueba inexistente' });
        let texto = ''; for await (const chunk of req) texto += chunk;
        const entrada = texto ? JSON.parse(texto) : null;
        solicitudes.push({ tabla, metodo: req.method, token, entrada, params: url.searchParams });
        const resultado = await db.transaction(async tx => {
          await tx.exec('SET LOCAL ROLE authenticated');
          await tx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user]);
          const valores = [], filtros = [];
          for (const columna of ['id_organizacion', 'id_diagnostico', 'version']) {
            const filtro = url.searchParams.get(columna);
            if (filtro) {
              if (!filtro.startsWith('eq.')) throw new Error('Filtro de pruebas no implementado');
              valores.push(filtro.slice(3)); filtros.push(`${columna}=$${valores.length}`);
            }
          }
          if (url.searchParams.get('archived_at') === 'is.null') filtros.push('archived_at IS NULL');
          const where = filtros.length ? ` WHERE ${filtros.join(' AND ')}` : '';
          if (req.method === 'GET') return tx.query(`SELECT * FROM public.${tabla}${where}`, valores);
          const columnas = Object.keys(entrada);
          const permitidas = ['id_organizacion', ...Object.keys(camposDiagnostico)];
          if (columnas.some(c => !permitidas.includes(c))) throw new Error('Columna de pruebas no permitida');
          if (tabla !== 'diagnosticos') throw new Error('Escritura de pruebas no implementada');
          if (req.method === 'POST') return tx.query(`INSERT INTO public.diagnosticos (${columnas.join(',')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, Object.values(entrada));
          if (req.method === 'PATCH') {
            const asignaciones = columnas.map(c => { valores.push(entrada[c]); return `${c}=$${valores.length}`; });
            return tx.query(`UPDATE public.diagnosticos SET ${asignaciones.join(',')}${where} RETURNING *`, valores);
          }
          throw new Error('Método de pruebas no implementado');
        });
        const filas = resultado.rows.map(fila => ({ ...fila, version: Number(fila.version),
          ...(fila.fecha_diagnostico ? { fecha_diagnostico: new Date(fila.fecha_diagnostico).toISOString().slice(0, 10) } : {}),
          ...(tabla === 'organizaciones' ? { pais: paises.find(p => p.id_pais === fila.id_pais) } : {}),
        }));
        return responder(req.method === 'POST' ? 201 : 200, filas);
      } catch (error) { responder(error.code === '42501' ? 403 : 400, { code: error.code, message: error.message }); }
    });
    const supabaseUrl = await escuchar(supabase);
    const repository = createSupabaseOrganizationsRepository({ supabaseUrl, anonKey: 'qa-anon' });
    const serviceUrl = await escuchar(createOrganizationsServer(createOrganizationsApplication(repository)));
    const gatewayUrl = await escuchar(createGatewayServer({ allowedOrigins: [origin], targets: { organizations: new URL(serviceUrl) } }));
    return { db, supabaseUrl, serviceUrl, gatewayUrl, solicitudes, crearOrganizacion, cerrar, usuarios: { ...usuarios, SIN_ROL: sinRol } };
  } catch (error) { await cerrar(); throw error; }
}
