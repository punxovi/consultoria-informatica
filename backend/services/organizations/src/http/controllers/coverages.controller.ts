import { OtorgarCoberturaUseCase } from '../../application/use-cases/otorgar-cobertura.ts';
import { ExtenderCoberturaUseCase } from '../../application/use-cases/extender-cobertura.ts';
import { RevocarCoberturaUseCase } from '../../application/use-cases/revocar-cobertura.ts';
import { ServiceError } from '../../../../../shared/errors/src/index.ts';
import { readJsonBody } from '../body.ts'; // Importamos la función para leer el body
import { CoberturaRepository } from '../../infrastructure/repositories/coberturas.repository.ts';

export class CoveragesController {
  private otorgarUseCase: OtorgarCoberturaUseCase;
  private extenderUseCase: ExtenderCoberturaUseCase;
  private revocarUseCase: RevocarCoberturaUseCase;
  private repository: CoberturaRepository; // Añade esta propiedad

  constructor(
    otorgarUseCase: OtorgarCoberturaUseCase,
    extenderUseCase: ExtenderCoberturaUseCase,
    revocarUseCase: RevocarCoberturaUseCase,
    repository: CoberturaRepository // Añade este parámetro al constructor
  ) {
    this.otorgarUseCase = otorgarUseCase;
    this.extenderUseCase = extenderUseCase;
    this.revocarUseCase = revocarUseCase;
    this.repository = repository;
  }

  async otorgar(req: any, res: any): Promise<void> {
    try {
      const adminId = ((req.headers['x-user-id'] as string) || 'sistema').trim();
      
      // Leemos el body usando la utilidad nativa de tu proyecto
      const bodyDatos = req.body ? req.body : await readJsonBody(req);
      console.log('DEBUG - adminId:', adminId);
      console.log('DEBUG - bodyDatos recibidos:', bodyDatos);

      const resultado = await this.otorgarUseCase.ejecutar(bodyDatos, adminId);
      
      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(resultado));
    } catch (error: any) {
      const status = error instanceof ServiceError ? error.status : 400;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error?.message || 'Error al otorgar cobertura temporal' }));
    }
  }

  async extender(req: any, res: any): Promise<void> {
    try {
      const adminId = (req.headers['x-user-id'] as string) || 'sistema';
      const idPermiso = req.params?.id; // Usamos el encadenamiento opcional por si no existe
      
      const bodyDatos = req.body ? req.body : await readJsonBody(req);
      
      const resultado = await this.extenderUseCase.ejecutar(idPermiso, bodyDatos, adminId);
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(resultado));
    } catch (error: any) {
      const status = error instanceof ServiceError ? error.status : 400;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error?.message || 'Error al extender cobertura temporal' }));
    }
  }

  async revocar(req: any, res: any): Promise<void> {
    try {
      const adminId = (req.headers['x-user-id'] as string) || 'sistema';
      const idPermiso = req.params?.id;
      
      const bodyDatos = req.body ? req.body : await readJsonBody(req);
      
      const resultado = await this.revocarUseCase.ejecutar(idPermiso, bodyDatos, adminId);
      
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(resultado));
    } catch (error: any) {
      const status = error instanceof ServiceError ? error.status : 400;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error?.message || 'Error al revocar cobertura temporal' }));
    }
  }

  async listarHistorial(req: any, res: any): Promise<void> {
    try {
      const adminId = ((req.headers['x-user-id'] as string) || '').trim();
      if (!adminId) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'No se ha proporcionado el identificador de usuario (x-user-id)' }));
        return;
      }

      // 1. Validar que el usuario tenga rol de Administrador en la tabla perfiles
      // USAMOS this.repository EN LUGAR DE this.otorgarUseCase['repository']
      const supabaseClient = this.repository.supabaseClient;

      //console.log('DEBUG ADMIN - Buscando id_usuario:', adminId);

      const { data: perfil, error: perfilError } = await supabaseClient
        .from('perfiles')
        .select('nombre')
        .eq('id_usuario', adminId)
        .single();

      //console.log('DEBUG ADMIN - Resultado perfil:', perfil);
      //console.log('DEBUG ADMIN - Error perfil:', perfilError);  

      if (perfilError || !perfil) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Acceso denegado: Usuario no encontrado o sin permisos' }));
        return;
      }

      // Verificamos si el nombre del perfil es Administrador
      const nombrePerfil = (perfil.nombre || '').trim();
      if (nombrePerfil !== 'Administrador') {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Acceso denegado: Solo los administradores pueden consultar el historial de auditoría' }));
        return;
      }

      // 2. Extraer parámetros de consulta (Query Params)
      const queryParams = req.query || {};
      
      const filtros = {
        accion_por: queryParams.accion_por,
        id_pais: queryParams.id_pais,
        tipo_evento: queryParams.tipo_evento,
        fecha_desde: queryParams.fecha_desde,
        fecha_hasta: queryParams.fecha_hasta,
        id_permiso_temporal: queryParams.id_permiso_temporal || queryParams.entidad,
        limit: queryParams.limit ? parseInt(queryParams.limit, 10) : 20,
        offset: queryParams.offset ? parseInt(queryParams.offset, 10) : 0,
      };

      // 3. Ejecutar la consulta en el repositorio
      // USAMOS this.repository AQUÍ TAMBIÉN
      const resultado = await this.repository.listarHistorialAuditoria(filtros);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(resultado));
    } catch (error: any) {
      const status = error instanceof ServiceError ? error.status : 400;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: error?.message || 'Error al consultar el historial de auditoría' }));
    }
  }


}