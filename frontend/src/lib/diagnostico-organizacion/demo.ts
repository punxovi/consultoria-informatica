import {
  type Diagnostico,
  type GuardarDiagnostico,
  type ServicioDiagnostico,
} from './modelo';

const diagnosticosDemo = new Map<string, Diagnostico>();

function esperar(milisegundos: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milisegundos);
  });
}

function clonarDiagnostico(diagnostico: Diagnostico): Diagnostico {
  return {
    ...diagnostico,
  };
}

function generarId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return `diagnostico-${Date.now()}`;
}

function fechaActual(): string {
  return new Date().toISOString();
}

export function crearDemoDiagnostico(): ServicioDiagnostico {
  return {
    async obtener(idOrganizacion) {
      await esperar(500);

      const diagnostico = diagnosticosDemo.get(idOrganizacion);

      if (!diagnostico) {
        return null;
      }

      return clonarDiagnostico(diagnostico);
    },

    async crear(idOrganizacion, entrada: GuardarDiagnostico) {
      await esperar(700);

      const ahora = fechaActual();

      const diagnostico: Diagnostico = {
        id_diagnostico: generarId(),
        id_organizacion: idOrganizacion,
        fecha_diagnostico: ahora.slice(0, 10),

        ...entrada.campos,

        created_at: ahora,
        updated_at: ahora,
        version: 1,
      };

      diagnosticosDemo.set(
        idOrganizacion,
        diagnostico,
      );

      return clonarDiagnostico(diagnostico);
    },

    async actualizar(
      idOrganizacion,
      idDiagnostico,
      version,
      entrada: GuardarDiagnostico,
    ) {
      await esperar(700);

      const actual = diagnosticosDemo.get(idOrganizacion);

      if (!actual) {
        throw new Error(
          'No existe un diagnóstico registrado para esta organización.',
        );
      }

      if (actual.id_diagnostico !== idDiagnostico) {
        throw new Error(
          'El diagnóstico que intentas actualizar no corresponde a esta organización.',
        );
      }

      if (actual.version !== version) {
        throw new Error(
          'El diagnóstico fue modificado anteriormente. Recarga la información antes de actualizarlo.',
        );
      }

      const actualizado: Diagnostico = {
        ...actual,
        ...entrada.campos,
        updated_at: fechaActual(),
        version: actual.version + 1,
      };

      diagnosticosDemo.set(
        idOrganizacion,
        actualizado,
      );

      return clonarDiagnostico(actualizado);
    },
  };
}