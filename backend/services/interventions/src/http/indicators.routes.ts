import type { IncomingMessage, ServerResponse } from 'node:http';
import { success } from '../../../../shared/contracts/src/index.ts';
import { associateIndicatorsSchema, createResultSchema, updateGoalSchema, updateResultSchema, parseIndicatorInput, type IndicatorsRepository } from '../domain/indicators.ts';
import { uuid } from '../domain/validation.ts';
import { readJsonBody } from './body.ts';

export async function routeIndicators(request: IncomingMessage, response: ServerResponse, path: string,
  requestId: string, token: string, repository: IndicatorsRepository): Promise<boolean> {
  function send(status: number, code: string, message: string, data: object) {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'x-request-id': requestId, 'cache-control': 'private, no-store' });
    response.end(JSON.stringify(success(code, message, data)));
    return true;
  }
  if (path === '/v1/indicators/catalog' && request.method === 'GET') {
    return send(200, 'CATALOGO_INDICADORES', 'Catálogo consultado.', { catalogo: await repository.catalog(token) });
  }
  const action = path.match(/^\/v1\/actions\/([^/]+)\/indicators$/);
  if (action) {
    const id = uuid(decodeURIComponent(action[1]), 'La Acción');
    if (request.method === 'GET') return send(200, 'INDICADORES_LISTADOS', 'Indicadores consultados.', { indicadores: await repository.list(token, id) });
    if (request.method === 'POST') return send(201, 'INDICADORES_ASOCIADOS', 'Indicadores asociados correctamente.', {
      indicadores: await repository.associate(token, id, parseIndicatorInput(associateIndicatorsSchema, await readJsonBody(request))),
    });
  }
  const indicator = path.match(/^\/v1\/indicators\/([^/]+)$/);
  if (indicator && request.method === 'PATCH') return send(200, 'META_ACTUALIZADA', 'Meta actualizada correctamente.', {
    indicador: await repository.updateGoal(token, uuid(decodeURIComponent(indicator[1]), 'El indicador'), parseIndicatorInput(updateGoalSchema, await readJsonBody(request))),
  });
  if (path === '/v1/results' && request.method === 'POST') return send(201, 'RESULTADO_REGISTRADO', 'Resultado guardado correctamente.', {
    resultado: await repository.createResult(token, parseIndicatorInput(createResultSchema, await readJsonBody(request))),
  });
  const result = path.match(/^\/v1\/results\/([^/]+)$/);
  if (result && request.method === 'PATCH') return send(200, 'RESULTADO_ACTUALIZADO', 'Resultado actualizado correctamente.', {
    resultado: await repository.updateResult(token, uuid(decodeURIComponent(result[1]), 'El resultado'), parseIndicatorInput(updateResultSchema, await readJsonBody(request))),
  });
  return false;
}
