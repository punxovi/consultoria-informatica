import { defineMiddleware } from 'astro:middleware';

const PUBLIC_PATHS = new Set(['/','/catalogo','/cotizar','/login','/recuperar-contrasena','/cambiar-contrasena','/solicitar-acceso-invitado','/invitado/acceso']);
const PUBLIC_PREFIXES = ['/api/v1/public/','/_astro/','/favicon','/Logo-'];

function isPublic(pathname: string) {
  if (pathname === '/images/producto-sin-foto.svg' || pathname === '/catalogo/') return true;
  return PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export const onRequest = defineMiddleware(async (context, next) => {
  if (isPublic(context.url.pathname)) return next();
  const token = context.cookies.get('fge_access_token')?.value;
  if (!token) return context.redirect(`/login?returnTo=${encodeURIComponent(context.url.pathname)}`, 302);

  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL;
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return context.redirect('/login', 302);
  try {
    let accessToken: string;
    try { accessToken = decodeURIComponent(token); } catch { return context.redirect('/login', 302); }
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: anonKey, authorization: `Bearer ${accessToken}` } });
    if (!response.ok) return context.redirect('/login', 302);
    const validity = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/get_user_roles`, {
      method: 'POST', headers: { apikey: anonKey, authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' }, body: '{}',
    });
    if (!validity.ok) return context.redirect('/login', 302);
    const roles = await validity.json();
    if (!Array.isArray(roles) || roles.length === 0) return context.redirect('/login', 302);
  } catch {
    return context.redirect('/login', 302);
  }
  return next();
});
