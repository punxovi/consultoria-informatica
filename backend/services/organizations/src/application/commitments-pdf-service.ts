import { z } from 'zod';
import { ServiceError } from '../../../../shared/errors/src/index.ts';
import type { OrganizationsRepository } from '../domain/organizations.ts';
import {
  MAX_PDF_COMMITMENTS, parseCommitmentsPdfContext, pdfCommitmentSchema,
  type CommitmentsPdfContext, type CommitmentsPdfFile, type CommitmentsPdfRenderer,
} from '../domain/commitments-pdf.ts';

type Repository = Pick<OrganizationsRepository, 'getById' | 'listCommitments' | 'auditCommitmentsExport'> & Partial<Pick<OrganizationsRepository, 'listCommitmentOrigins'>>;

export function createCommitmentsPdfService(repository: Repository, render: CommitmentsPdfRenderer) {
  return async (token: string, input: CommitmentsPdfContext): Promise<CommitmentsPdfFile> => {
    if (!token.trim()) throw new ServiceError('SESION_REQUERIDA', 'Debes iniciar sesión para descargar compromisos.', 401);
    const context = parseCommitmentsPdfContext(input);
    // Ambas lecturas conservan el JWT: RLS y la RPC autorizan el contexto real.
    const organization = await repository.getById(token, context.id_organizacion);
    if (organization.id_organizacion !== context.id_organizacion || !organization.nombre?.trim()) {
      throw new ServiceError('RESPUESTA_INVALIDA', 'La organización recibida no corresponde al contexto solicitado.', 502);
    }
    const rows = await repository.listCommitments(token, context.id_organizacion,
      context.id_acta ? { id_acta: context.id_acta } : {});
    const parsed = z.array(pdfCommitmentSchema).safeParse(rows);
    if (!parsed.success || parsed.data.some(item =>
      item.id_organizacion !== context.id_organizacion ||
      (context.id_acta && item.id_acta !== context.id_acta))) {
      throw new ServiceError('RESPUESTA_INVALIDA', 'Los compromisos recibidos no corresponden al contexto o son inválidos.', 502);
    }
    if (!parsed.data.length) {
      throw new ServiceError('COMPROMISOS_SIN_DATOS', 'No hay compromisos disponibles para el contexto seleccionado.', 404);
    }
    if (parsed.data.length > MAX_PDF_COMMITMENTS) {
      throw new ServiceError('PDF_DEMASIADO_GRANDE', 'Hay demasiados compromisos; filtra por acta para descargar el PDF.', 413);
    }
    const commitments = parsed.data.sort((a, b) =>
      a.fecha_limite.localeCompare(b.fecha_limite) || a.id_compromiso.localeCompare(b.id_compromiso));
    // Nombres legibles de las actas: si no están disponibles, el PDF se genera igual.
    const actas: Record<string, string> = {};
    try {
      const origenes = await repository.listCommitmentOrigins?.(token, context.id_organizacion);
      for (const acta of origenes?.actas ?? []) {
        if (typeof acta?.id_acta === 'string' && typeof acta.nombre === 'string' && acta.nombre.trim()) actas[acta.id_acta] = acta.nombre.trim();
      }
    } catch { /* se usa una etiqueta genérica para el acta */ }
    let bytes: Buffer;
    try {
      bytes = await render({ organization, context, commitments, actas, generatedAt: new Date().toISOString() });
      if (!Buffer.isBuffer(bytes) || bytes.subarray(0, 5).toString() !== '%PDF-' ||
          !bytes.subarray(-64).toString().includes('%%EOF')) throw new Error('PDF inválido');
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('PDF_GENERACION_FALLIDA', 'No fue posible generar el PDF de compromisos.', 500, error);
    }
    await repository.auditCommitmentsExport(token,context);
    return {
      bytes, mimeType: 'application/pdf',
      fileName: `compromisos-${context.id_organizacion}${context.id_acta ? `-acta-${context.id_acta}` : ''}.pdf`,
    };
  };
}
