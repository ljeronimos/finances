import { requireAuth, unauthorized } from './_auth.js';
import { getUserPreferences } from './_services/preferences.js';

export async function onRequestGet(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

    const data = await getUserPreferences(env, user.id);

    return Response.json(data);

    //if (data.length) return Response.json(data[0]);

    //return Response.json({});
}

export async function onRequestPatch(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const allowed = ['display_name', 'default_paid_by', 'default_shared', 'share_column'];
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