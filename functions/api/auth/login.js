export async function onRequestPost(context) {
    const { request, env } = context;
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { email, password } = body;
    if (!email || !password) return Response.json({ error: 'Email and password required' }, { status: 400 });

    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': env.SUPABASE_SERVICE_KEY },
        body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
        const err = await res.json();
        return Response.json({ error: err.error_description || 'Invalid credentials' }, { status: 401 });
    }

    const data = await res.json();
    return Response.json({ access_token: data.access_token, refresh_token: data.refresh_token, user: data.user });
}