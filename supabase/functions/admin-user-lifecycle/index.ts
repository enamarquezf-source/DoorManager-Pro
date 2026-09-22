import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const inviteRedirectUrl = Deno.env.get('DMP_AUTH_INVITE_REDIRECT_URL') ?? '';
const allowedOrigins = new Set((Deno.env.get('DMP_ALLOWED_ORIGINS') ?? '').split(',').map((value) => value.trim()).filter(Boolean));
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function json(body: JsonRecord, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } });
}

function corsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'null',
    Vary: 'Origin',
  };
}

function safeError(message: string, status = 400, origin: string | null) {
  return json({ error: message }, status, origin);
}

function bearer(request: Request) {
  const value = request.headers.get('Authorization') ?? '';
  return value.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
}

function normalizedEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(value: string) {
  return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function inviteMarker(intentId: string) {
  return { dmp_invite_intent_id: intentId };
}

function hasInviteMarker(user: JsonRecord, intentId: string, intentCreatedAt: string) {
  const metadata = user.app_metadata && typeof user.app_metadata === 'object' ? user.app_metadata as JsonRecord : {};
  const userMetadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata as JsonRecord : {};
  const createdAfterIntent = typeof user.created_at === 'string' && new Date(user.created_at).getTime() >= new Date(intentCreatedAt).getTime();
  return metadata.dmp_invite_intent_id === intentId || (createdAfterIntent && userMetadata.dmp_invite_intent_id === intentId);
}

async function findAuthUser(admin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 100; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    const match = result.data.users.find((user) => normalizedEmail(user.email) === email);
    if (match) return match;
    if (result.data.users.length < 1000) return null;
  }
  throw new Error('Auth user lookup exceeded the safe page limit');
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    if (!origin || !allowedOrigins.has(origin)) return new Response(null, { status: 403, headers: corsHeaders(origin) });
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== 'POST') return safeError('Metodo no permitido.', 405, origin);
  if (!origin || !allowedOrigins.has(origin)) return safeError('Origen no permitido.', 403, origin);
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !inviteRedirectUrl || !allowedOrigins.size) return safeError('La operacion Auth no esta configurada.', 503, origin);

  const token = bearer(request);
  if (!token) return safeError('Sesion requerida.', 401, origin);

  try {
    const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userError } = await caller.auth.getUser(token);
    if (userError || !userData.user) return safeError('Sesion no valida.', 401, origin);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: actor, error: actorError } = await admin.from('profiles').select('id,company_id,active,deleted_at').eq('auth_user_id', userData.user.id).maybeSingle();
    if (actorError || !actor || actor.active !== true || actor.deleted_at) return safeError('Actor no autorizado.', 403, origin);
    const { data: actorRoles, error: roleError } = await admin.from('profile_roles').select('roles!profile_roles_role_id_fkey(name)').eq('profile_id', actor.id);
    if (roleError || !actorRoles?.some((row: any) => row.roles?.name === 'superadmin')) return safeError('Actor no autorizado.', 403, origin);

    const body = await request.json().catch(() => null) as JsonRecord | null;
    if (!body || body.action !== 'invite_profile' || typeof body.profile_id !== 'string' || !uuidPattern.test(body.profile_id)) return safeError('Solicitud no valida.', 400, origin);
    const operationId = crypto.randomUUID();
    const reserved = await admin.rpc('dmp_admin_reserve_auth_invite', { p_profile_id: body.profile_id, p_actor_profile_id: actor.id, p_operation_id: operationId });
    if (reserved.error || !reserved.data) return safeError('No se ha podido preparar la invitacion de forma segura.', 409, origin);
    const intent = reserved.data as { intent_id?: string; profile_id: string; company_id: string; email: string; created_at?: string; operation_id?: string; state: 'pending' | 'invited' | 'linked' | 'busy'; auth_user_id?: string | null };
    if ((intent as any).state === 'busy') return safeError('Ya hay una invitacion en curso para este perfil. Reintenta en unos instantes.', 409, origin);
    if (intent.state === 'linked') return json({ status: 'already_linked', profile_id: intent.profile_id }, 200, origin);

    let authUser;
    if (intent.state === 'invited' && intent.auth_user_id) {
      const existing = await admin.auth.admin.getUserById(intent.auth_user_id);
      if (existing.error || !existing.data.user || normalizedEmail(existing.data.user.email) !== intent.email) return safeError('La invitacion existe, pero no se puede reconciliar de forma segura. Reintenta.', 409, origin);
      authUser = existing.data.user;
    } else {
      authUser = await findAuthUser(admin, intent.email);
      if (authUser) {
        const { data: linkedProfile } = await admin.from('profiles').select('id').eq('auth_user_id', authUser.id).maybeSingle();
        if (linkedProfile && linkedProfile.id !== intent.profile_id) return safeError('No se puede completar la invitacion para este perfil.', 409, origin);
        if (!hasInviteMarker(authUser as unknown as JsonRecord, intent.intent_id ?? '', intent.created_at ?? '')) return safeError('No se puede verificar de forma segura la cuenta Auth existente.', 409, origin);
      }
    }

    if (!authUser) {
      const invited = await admin.auth.admin.inviteUserByEmail(intent.email, {
        redirectTo: inviteRedirectUrl,
        data: { dmp_invite_intent_id: intent.intent_id },
      });
      if (invited.error || !invited.data.user) {
        await admin.rpc('dmp_admin_release_auth_invite', { p_intent_id: intent.intent_id, p_operation_id: operationId, p_actor_profile_id: actor.id });
        return safeError('No se ha podido enviar la invitacion.', 502, origin);
      }
      authUser = invited.data.user;
    }

    if (!intent.auth_user_id && authUser) {
      const recorded = await admin.rpc('dmp_admin_record_auth_invite', { p_intent_id: intent.intent_id, p_auth_user_id: authUser.id, p_actor_profile_id: actor.id, p_operation_id: operationId });
      if (recorded.error && !String(recorded.error.message ?? '').includes('already_recorded')) return safeError('La invitacion existe, pero no se pudo persistir su estado. Reintenta.', 409, origin);
    }
    const appMetadata = { ...(authUser.app_metadata ?? {}), ...inviteMarker(intent.intent_id ?? '') };
    const marked = await admin.auth.admin.updateUserById(authUser.id, { app_metadata: appMetadata });
    if (marked.error) console.error('[admin-user-lifecycle] marker update deferred');

    const { data: linked, error: linkError } = await admin.rpc('dmp_admin_finalize_auth_invite', {
      p_intent_id: intent.intent_id,
      p_auth_user_id: authUser.id,
      p_actor_profile_id: actor.id,
      p_operation_id: operationId,
    });
    if (linkError || !linked) return safeError('La invitacion existe, pero el perfil no se pudo vincular. Reintenta.', 409, origin);
    return json(linked as JsonRecord, 200, origin);
  } catch (error) {
    console.error('[admin-user-lifecycle]', error instanceof Error ? error.message : 'operation failed');
    return safeError('No se ha podido completar la operacion Auth.', 500, origin);
  }
});
