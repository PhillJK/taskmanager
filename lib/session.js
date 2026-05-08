export const sessionOptions = {
  password: process.env.SECRET_COOKIE_PASSWORD,
  cookieName: 'ttos-sess',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  },
};

// Attaches session user to req, returns 401 if not authenticated
export async function requireAuth(req, res, allowedRoles = null) {
  const { getIronSession } = await import('iron-session');
  const session = await getIronSession(req, res, sessionOptions);
  if (!session.user) { res.status(401).json({ error: 'Unauthorized' }); return null; }
  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    res.status(403).json({ error: 'Forbidden' }); return null;
  }
  return session.user;
}
