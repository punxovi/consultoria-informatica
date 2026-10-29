import { Router } from 'express';
import { CoveragesController } from '../controllers/coverages.controller.ts';
import { OtorgarCoberturaUseCase } from '../../application/use-cases/otorgar-cobertura.ts';
import { ExtenderCoberturaUseCase } from '../../application/use-cases/extender-cobertura.ts';
import { RevocarCoberturaUseCase } from '../../application/use-cases/revocar-cobertura.ts';
import { CoberturaRepository } from '../../infrastructure/repositories/coberturas.repository.ts';

export function createCoveragesRouter(supabaseClient: any): Router {
  const router = Router();

  const repository = new CoberturaRepository(supabaseClient);
  const otorgarUseCase = new OtorgarCoberturaUseCase(repository);
  const extenderUseCase = new ExtenderCoberturaUseCase(repository);
  const revocarUseCase = new RevocarCoberturaUseCase(repository);

  const controller = new CoveragesController(otorgarUseCase, extenderUseCase, revocarUseCase, repository);

  // Definición de endpoints para coberturas temporales
  router.post('/temporary-coverages', (req, res) => controller.otorgar(req, res));
  router.patch('/temporary-coverages/:id/extend', (req, res) => controller.extender(req, res));
  router.patch('/temporary-coverages/:id/revoke', (req, res) => controller.revocar(req, res));
  router.get('/temporary-coverages/audit-logs', (req, res) => controller.listarHistorial(req, res));
  router.get('/temporary-coverages/mine', (req, res) => controller.listarMisCoberturasVigentes(req, res),);

  return router;
}