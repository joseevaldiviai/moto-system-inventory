import { createClient } from '@supabase/supabase-js';

const SESSION_HEADER = 'x-app-session-id';

export function createPublicClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createAdminClient(env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getRequestSessionId(request) {
  return request.headers.get(SESSION_HEADER)?.trim() || null;
}

export async function requireAuth(request, env) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const sessionId = getRequestSessionId(request);
  if (!token) throw new Error('Sesion invalida o expirada');
  if (!sessionId) throw new Error('Sesion invalida o expirada');

  const admin = createAdminClient(env);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData?.user) throw new Error('Sesion invalida o expirada');

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('id, email, username, nombre, rol, activo, sesion_activa_id, sesion_activa_actualizada_en')
    .eq('id', authData.user.id)
    .single();

  if (profileError || !profile || !profile.activo) throw new Error('Usuario no autorizado');
  if (!profile.sesion_activa_id || profile.sesion_activa_id !== sessionId) {
    throw new Error('La sesion fue reemplazada por un nuevo inicio de sesion');
  }

  return { token, user: authData.user, profile, admin, sessionId };
}

export async function requireSupervisor(request, env) {
  const session = await requireAuth(request, env);
  if (session.profile.rol !== 'SUPERVISOR') throw new Error('Se requiere rol de Supervisor');
  return session;
}
