import type { Evento } from './modelo.ts';

type Genero = 'f' | 'm';
const secciones: Record<string, [string, Genero]> = {
  paises: ['país', 'm'],
  perfiles: ['perfil de usuario', 'm'],
  roles: ['rol', 'm'],
  permisos: ['permiso', 'm'],
  roles_permisos: ['permiso de un rol', 'm'],
  asignaciones_roles: ['acceso de una cuenta', 'm'],
  cuentas_coordinadores: ['cuenta de coordinador', 'f'],
  permisos_temporales: ['cobertura temporal', 'f'],
  permisos_temporales_historial: ['historial de una cobertura', 'm'],
  permiso_temporal_detalles: ['detalle de una cobertura', 'm'],
  organizaciones: ['organización', 'f'],
  organizacion_redes: ['red de una organización', 'f'],
  contactos: ['contacto', 'm'],
  informacion_legal: ['expediente legal', 'm'],
  diagnosticos: ['diagnóstico', 'm'],
  programas: ['programa institucional', 'm'],
  programa_lineas_accion: ['línea de acción de un programa', 'f'],
  planes: ['plan de intervención', 'm'],
  acciones: ['acción', 'f'],
  actas: ['acta de reunión', 'f'],
  acta_participantes: ['participante de un acta', 'm'],
  compromisos: ['compromiso', 'm'],
  indicadores: ['indicador', 'm'],
  resultados: ['resultado', 'm'],
  donaciones: ['donación', 'f'],
  archivos: ['archivo', 'm'],
  productos: ['producto', 'm'],
  solicitudes_cotizacion: ['solicitud de cotización', 'f'],
  solicitud_cotizacion_detalles: ['producto de una solicitud de cotización', 'm'],
  solicitud_cotizacion_destinatarios: ['destinatario de una solicitud de cotización', 'm'],
  solicitudes_invitado: ['solicitud de acceso de invitado', 'f'],
};

export const opcionesSeccion: [string, string][] = [
  ['organizaciones', 'Organizaciones'], ['programas', 'Programas institucionales'], ['planes', 'Planes de intervención'],
  ['acciones', 'Acciones'], ['actas', 'Actas de reunión'], ['compromisos', 'Compromisos'], ['diagnosticos', 'Diagnósticos'],
  ['donaciones', 'Donaciones'], ['informacion_legal', 'Expediente legal'], ['indicadores', 'Indicadores'], ['resultados', 'Resultados'],
  ['productos', 'Productos'], ['solicitudes_cotizacion', 'Solicitudes de cotización'], ['paises', 'Países'],
  ['asignaciones_roles', 'Accesos de cuentas'], ['permisos_temporales', 'Coberturas temporales'], ['archivos', 'Archivos'],
  ['autenticacion', 'Inicios de sesión'],
];

// Mismas categorías que muestra la columna «Qué hizo»; la consulta filtra por esta clasificación.
export const opcionesAccion: [string, string][] = [
  ['crear', 'Creó o agregó'], ['modificar', 'Modificó'], ['archivar', 'Eliminó (queda archivado)'],
  ['restaurar', 'Restauró'], ['eliminar', 'Eliminó definitivamente'], ['inicio_sesion', 'Inició sesión'],
  ['inicio_sesion_fallido', 'Intento de inicio de sesión fallido'], ['lectura_documento', 'Consultó un documento'],
];

const nombresCampo: Record<string, string> = {
  nombre: 'nombre', apellido: 'apellido', correo: 'correo', telefono: 'teléfono', direccion: 'dirección',
  descripcion: 'descripción', descripcion_breve: 'descripción', estado: 'estado', publicado: 'publicación',
  fecha_inicio: 'fecha de inicio', fecha_termino: 'fecha de término', fecha: 'fecha', fin_at: 'fecha de término',
  inicio_at: 'fecha de inicio', id_pais: 'país', id_organizacion: 'organización', id_programa: 'programa',
  nombre_representante: 'representante', numero_beneficiarios: 'número de beneficiarios', tipo_organizacion: 'tipo de organización',
  region_departamento: 'región', comuna_municipio_ciudad: 'comuna o ciudad', publico_objetivo: 'público objetivo',
  objetivo_general: 'objetivo general', objetivos_especificos: 'objetivos específicos', resultado_esperado: 'resultado esperado',
  responsable_nombre: 'responsable', periodo_anual: 'período', unidad_medida: 'unidad de medida', cantidad: 'cantidad',
  monto: 'monto', categoria: 'categoría', material_terminacion: 'material y terminación', meta: 'meta', valor: 'valor',
  activo: 'estado de la cuenta', revocado_at: 'revocación', motivo: 'motivo', motivo_revocacion: 'motivo de revocación',
  zona_horaria: 'zona horaria', codigo_iso: 'código del país', titulo: 'título', mensaje: 'mensaje',
  estado_carga: 'estado del archivo', nombre_original: 'nombre del archivo',
};

const roles: Record<string, string> = { ADMIN: 'Administrador', COORD: 'Coordinador', INVIT: 'Invitado' };

export type Tono = 'crear' | 'modificar' | 'eliminar' | 'restaurar' | 'sesion' | 'alerta' | 'consulta';

export interface EventoLegible {
  tono: Tono;
  accion: string;
  descripcion: string;
  persona: string;
  detallePersona: string;
  fecha: string;
  hora: string;
}

function seccion(entidad: string): [string, Genero] {
  return secciones[entidad] ?? [entidad.replace(/_/g, ' '), 'm'];
}

function articulo(entidad: string) {
  const [nombre, genero] = seccion(entidad);
  return `${genero === 'f' ? 'la' : 'el'} ${nombre}`;
}

function campo(nombre: string) {
  return nombresCampo[nombre] ?? nombre.replace(/^id_/, '').replace(/_at$/, '').replace(/_/g, ' ');
}

function lista(valores: string[]) {
  const unicos = [...new Set(valores)];
  if (unicos.length <= 1) return unicos.join('');
  return `${unicos.slice(0, -1).join(', ')} y ${unicos.at(-1)}`;
}

export function nombreSeccion(entidad: string) {
  const [nombre] = seccion(entidad);
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

export function describirEvento(evento: Evento): EventoLegible {
  const fecha = new Date(evento.fecha_hora);
  const persona = evento.correo || evento.usuario || 'Proceso automático del sistema';
  const extras = [
    evento.nombre_usuario && evento.nombre_usuario !== persona ? evento.nombre_usuario : null,
    evento.rol ? roles[evento.rol] ?? evento.rol : null,
  ].filter(Boolean);
  const comun = {
    persona,
    detallePersona: extras.join(' · '),
    fecha: fecha.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    hora: fecha.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
  const registro = evento.nombre_registro ? ` «${evento.nombre_registro}»` : '';
  const objeto = `${articulo(evento.entidad)}${registro}`;

  if (evento.accion_especial === 'inicio_sesion') return { ...comun, tono: 'sesion', accion: 'Inició sesión', descripcion: 'Ingresó al sistema.' };
  if (evento.accion_especial === 'inicio_sesion_fallido') return { ...comun, tono: 'alerta', accion: 'Intento de inicio de sesión fallido', descripcion: 'Intentó ingresar al sistema, pero el acceso fue rechazado.' };
  if (evento.accion_especial === 'lectura_documento') return { ...comun, tono: 'consulta', accion: 'Consultó un documento', descripcion: 'Abrió un documento del expediente legal.' };
  if (evento.entidad === 'autenticacion') return { ...comun, tono: 'sesion', accion: 'Inicio de sesión', descripcion: 'Actividad de acceso al sistema.' };

  if (evento.cambio_estado === 'archivado') return { ...comun, tono: 'eliminar', accion: 'Eliminó', descripcion: `Eliminó ${objeto}. Queda archivado en el historial.` };
  if (evento.cambio_estado === 'restaurado') return { ...comun, tono: 'restaurar', accion: 'Restauró', descripcion: `Volvió a activar ${objeto}.` };

  switch (evento.operacion) {
    case 'INSERT': return { ...comun, tono: 'crear', accion: 'Creó', descripcion: `Agregó ${objeto}.` };
    case 'DELETE': return { ...comun, tono: 'eliminar', accion: 'Eliminó', descripcion: `Eliminó definitivamente ${objeto}.` };
    case 'UPDATE': {
      const campos = (evento.campos_modificados ?? []).map(campo);
      const cambios = campos.length ? ` Cambió: ${lista(campos.slice(0, 6))}${campos.length > 6 ? ' y otros datos' : ''}.` : '';
      return { ...comun, tono: 'modificar', accion: 'Modificó', descripcion: `Modificó ${objeto}.${cambios}` };
    }
    default: return { ...comun, tono: 'consulta', accion: 'Registró una actividad', descripcion: `Actividad en ${objeto}.` };
  }
}
