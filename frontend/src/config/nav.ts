export interface NavItem {
  label: string;
  href: string;
  // Roles que ven el ítem; si se omite, lo ven todos los usuarios con sesión.
  roles?: string[];
}

// Navegación provisional de páginas internas (RF19, HU08).
// Se ajusta cuando estén definidas las rutas reales de cada módulo.
export const mainNavItems: NavItem[] = [
  { label: 'Inicio', href: '/dashboard' },
  { label: 'Organizaciones', href: '/organizaciones' },
  { label: 'Programas Institucionales', href: '/programas' },
  { label: 'Planes de Intervención', href: '/planes' },
  { label: 'Reportes', href: '/reportes' },
  { label: 'Coordinadores', href: '/administracion/coordinadores', roles: ['ADMIN'] },
];
