import { requireAuth, unauthorized } from './_auth.js';

export async function onRequestGet(context) {
    const { request, env } = context;
    const { error } = await requireAuth(request, env);
    if (error) return unauthorized();

    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/categories?select=category&order=category`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
    return Response.json(await res.json());
}
