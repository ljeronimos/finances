export async function onRequestPost(context) {
    const { request, env } = context;
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

    if (!body.email) return Response.json({ error: 'Email required' }, { status: 400 });

    await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': env.SUPABASE_SERVICE_KEY },
        body: JSON.stringify({ email: body.email }),
    });

    // Always return success to avoid email enumeration
    return Response.json({ success: true });
}
