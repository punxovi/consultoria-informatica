export interface NavItem {
  label: string;
  href: string;
  roles?: string[];
  /** Sección del menú lateral; los títulos se muestran solo si el usuario ve alguno de sus enlaces. */
  grupo?: 'Gestión' | 'Cotizaciones' | 'Administración';
}

export const mainNavItems: NavItem[] = [
  { label: 'Inicio', href: '/dashboard', grupo: 'Gestión' },
  { label: 'Organizaciones', href: '/organizaciones', grupo: 'Gestión' },
  { label: 'Programas Institucionales', href: '/programas', grupo: 'Gestión' },
  { label: 'Planes de Intervención', href: '/planes', grupo: 'Gestión' },
  { label: 'Reportes', href: '/reportes', grupo: 'Gestión' },
  { label: 'Solicitudes de cotización', href: '/cotizaciones', roles: ['ADMIN', 'COORD'], grupo: 'Cotizaciones' },
  { label: 'Productos', href: '/administracion/productos', roles: ['ADMIN'], grupo: 'Cotizaciones' },
  { label: 'Coordinadores', href: '/administracion/coordinadores', roles: ['ADMIN'], grupo: 'Administración' },
  { label: 'Coberturas temporales', href: '/administracion/coberturas', roles: ['ADMIN'], grupo: 'Administración' },
  { label: 'Países', href: '/administracion/paises', roles: ['ADMIN'], grupo: 'Administración' },
  { label: 'Solicitudes de Invitado', href: '/administracion/solicitudes-invitado', roles: ['ADMIN'], grupo: 'Administración' },
  { label: 'Auditoría', href: '/administracion/auditoria', roles: ['ADMIN'], grupo: 'Administración' },
];
