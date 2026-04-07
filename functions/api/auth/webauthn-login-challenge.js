export async function onRequestPost(context) {
    const { request, env } = context;
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

    if (!body.email) return Response.json({ error: 'Email required' }, { status: 400 });

    const userRes = await fetch(
        `${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(body.email)}`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    if (!userRes.ok) return Response.json({ error: 'User not found' }, { status: 404 });
    const userData = await userRes.json();
    const user = userData.users?.[0];
    if (!user) return Response.json({ error: 'User not found' }, { status: 404 });

    const credRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/webauthn_credentials?user_id=eq.${user.id}&select=credential_id`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    const credentials = await credRes.json();
    if (!credentials.length) return Response.json({ error: 'No credentials registered' }, { status: 404 });

    const challengeBytes = crypto.getRandomValues(new Uint8Array(32));
    const challenge = btoa(String.fromCharCode(...challengeBytes))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/webauthn_challenges`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Prefer': 'return=representation',
        },
        body: JSON.stringify({ user_id: user.id, challenge }),
    });
    const [record] = await res.json();

    return Response.json({
        challengeId: record.id, challenge, userId: user.id,
        allowCredentials: credentials.map(c => ({ type: 'public-key', id: c.credential_id })),
        timeout: 60000, userVerification: 'required',
    });
}
