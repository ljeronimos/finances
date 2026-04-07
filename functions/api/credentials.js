import { requireAuth, unauthorized } from './_auth.js';

export async function onRequestDelete(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing id' }, { status: 400 });

    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/webauthn_credentials?id=eq.${id}&user_id=eq.${user.id}`,
        { method: 'DELETE', headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );

    if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
    return Response.json({ success: true });
}
