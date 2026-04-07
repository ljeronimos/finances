import { requireAuth, unauthorized } from './_auth.js';

export async function onRequestGet(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

    const [prefRes, credRes] = await Promise.all([
        fetch(`${env.SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${user.id}`,
            { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }),
        fetch(`${env.SUPABASE_URL}/rest/v1/webauthn_credentials?user_id=eq.${user.id}&select=id,device_name,created_at`,
            { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }),
    ]);

    return Response.json({
        preferences: (await prefRes.json())[0] || {},
        credentials: await credRes.json(),
        email: user.email,
    });
}

export async function onRequestPatch(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const allowed = ['display_name', 'default_paid_by', 'default_shared'];
    const updates = Object.fromEntries(allowed.filter(k => body[k] !== undefined).map(k => [k, body[k]]));

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/user_preferences`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Prefer': 'resolution=merge-duplicates,return=representation',
        },
        body: JSON.stringify({ user_id: user.id, ...updates }),
    });

    if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
    return Response.json((await res.json())[0]);
}

export async function onRequestDelete(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` },
    });

    if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
    return Response.json({ success: true });
}
