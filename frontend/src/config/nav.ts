export interface NavItem {
  label: string;
  href: string;
}

// Navegación provisional de páginas internas (RF19, HU08).
// Se ajusta cuando estén definidas las rutas reales de cada módulo.
export const mainNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Organizaciones', href: '/organizaciones' },
  { label: 'Programas Institucionales', href: '/programas' },
  { label: 'Planes de Intervención', href: '/planes' },
  { label: 'Seguimiento', href: '/seguimiento' },
  { label: 'Reportes', href: '/reportes' },
];
