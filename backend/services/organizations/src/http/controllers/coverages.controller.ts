import { OtorgarCoberturaUseCase } from '../../application/use-cases/otorgar-cobertura.ts';
import { ExtenderCoberturaUseCase } from '../../application/use-cases/extender-cobertura.ts';
import { RevocarCoberturaUseCase } from '../../application/use-cases/revocar-cobertura.ts';
import { ServiceError } from '../../../../../shared/errors/src/index.ts';
import { readJsonBody } from '../body.ts';
import { CoberturaRepository } from '../../infrastructure/repositories/coberturas.repository.ts';

export class CoveragesController {
  private otorgarUseCase: OtorgarCoberturaUseCase;
  private extenderUseCase: ExtenderCoberturaUseCase;
  private revocarUseCase: RevocarCoberturaUseCase;
  private repository: CoberturaRepository;

  constructor(
    otorgarUseCase: OtorgarCoberturaUseCase,
    extenderUseCase: ExtenderCoberturaUseCase,
    revocarUseCase: RevocarCoberturaUseCase,
    repository: CoberturaRepository,
  ) {
    this.otorgarUseCase = otorgarUseCase;
    this.extenderUseCase = extenderUseCase;
    this.revocarUseCase = revocarUseCase;
    this.repository = repository;
  }

  async otorgar(req: any, res: any): Promise<void> {
    try {
      const adminId = ((req.headers['x-user-id'] as string) || 'sistema').trim();
      const bodyDatos = req.body ? req.body : await readJsonBody(req);
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
      const idPermiso = req.params?.id;
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

  /**
   * Consulta las coberturas vigentes del usuario autenticado.
   * La identidad se extrae de un JWT verificado por Supabase; no se usa x-user-id
   * ni un id enviado como parámetro por el cliente para decidir qué datos devolver.
   */
  async listarMisCoberturasVigentes(req: any, res: any): Promise<void> {
    try {
      const authorization = req.headers?.authorization ?? req.headers?.Authorization;
      const token = typeof authorization === 'string'
        ? authorization.match(/^Bearer\s+(.+)$/i)?.[1]
        : undefined;

      if (!token) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Debes iniciar sesión para consultar tus coberturas.' }));
        return;
      }

      // getUser(token) valida el JWT con Supabase y devuelve la identidad autenticada.
      const { data, error } = await this.repository.supabaseClient.auth.getUser(token);
      const userId = data?.user?.id;

      if (error || !userId) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'La sesión no es válida o ha expirado.' }));
        return;
      }

      const coverages = await this.repository.listarVigentesPorUsuario(userId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ coverages }));
    } catch (error: any) {
      console.error('Error al consultar coberturas vigentes del usuario:', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'No fue posible consultar las coberturas vigentes.' }));
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

      const supabaseClient = this.repository.supabaseClient;
      const { data: perfil, error: perfilError } = await supabaseClient
        .from('perfiles')
        .select('nombre')
        .eq('id_usuario', adminId)
        .single();

      if (perfilError || !perfil) {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Acceso denegado: Usuario no encontrado o sin permisos' }));
        return;
      }

      const nombrePerfil = (perfil.nombre || '').trim();
      if (nombrePerfil !== 'Administrador') {
        res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Acceso denegado: Solo los administradores pueden consultar el historial de auditoría' }));
        return;
      }

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
