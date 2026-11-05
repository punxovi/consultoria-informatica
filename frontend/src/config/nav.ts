export interface NavItem {
  label: string;
  href: string;
  roles?: string[];
}

export const mainNavItems: NavItem[] = [
  { label: 'Inicio', href: '/dashboard' },
  { label: 'Organizaciones', href: '/organizaciones' },
  { label: 'Programas Institucionales', href: '/programas' },
  { label: 'Planes de Intervención', href: '/planes' },
  { label: 'Reportes', href: '/reportes' },
  { label: 'Solicitudes de cotización', href: '/cotizaciones', roles: ['ADMIN','COORD'] },
  { label: 'Países', href: '/administracion/paises', roles: ['ADMIN'] },
  { label: 'Coordinadores', href: '/administracion/coordinadores', roles: ['ADMIN'] },
  { label: 'Coberturas temporales', href: '/administracion/coberturas', roles: ['ADMIN'] },
  { label: 'Productos', href: '/administracion/productos', roles: ['ADMIN'] },
  { label: 'Auditoría', href: '/administracion/auditoria', roles: ['ADMIN'] },
  { label: 'Solicitudes de Invitado', href: '/administracion/solicitudes-invitado', roles: ['ADMIN'], },
];
