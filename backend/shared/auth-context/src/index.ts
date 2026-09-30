export interface AuthContext {
  accessToken: string | null;
  authenticated: boolean;
}

export function authContext(authorization: string | undefined): AuthContext {
  const prefix = 'Bearer ';
  const accessToken = authorization?.startsWith(prefix)
    ? authorization.slice(prefix.length).trim()
    : null;

  return { accessToken: accessToken || null, authenticated: Boolean(accessToken) };
}
