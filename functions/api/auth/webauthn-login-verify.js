export async function onRequestPost(context) {
    const { request, env } = context;
    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { challengeId, userId, credentialId, clientDataJSON } = body;
    if (!challengeId || !userId || !credentialId || !clientDataJSON)
        return Response.json({ error: 'Missing required fields' }, { status: 400 });

    const challengeRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/webauthn_challenges?id=eq.${challengeId}&user_id=eq.${userId}`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    const challenges = await challengeRes.json();
    if (!challenges.length) return Response.json({ error: 'Challenge not found' }, { status: 400 });

    const rec = challenges[0];
    if (Date.now() - new Date(rec.created_at).getTime() > 5 * 60 * 1000)
        return Response.json({ error: 'Challenge expired' }, { status: 400 });

    const clientData = JSON.parse(atob(clientDataJSON.replace(/-/g, '+').replace(/_/g, '/')));
    if (clientData.challenge !== rec.challenge) return Response.json({ error: 'Challenge mismatch' }, { status: 400 });
    if (clientData.type !== 'webauthn.get') return Response.json({ error: 'Invalid type' }, { status: 400 });

    const credRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/webauthn_credentials?credential_id=eq.${credentialId}&user_id=eq.${userId}`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    const creds = await credRes.json();
    if (!creds.length) return Response.json({ error: 'Credential not found' }, { status: 400 });

    // Delete used challenge
    await fetch(`${env.SUPABASE_URL}/rest/v1/webauthn_challenges?id=eq.${challengeId}`,
        { method: 'DELETE', headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );

    // Update sign count
    await fetch(`${env.SUPABASE_URL}/rest/v1/webauthn_credentials?id=eq.${creds[0].id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` },
        body: JSON.stringify({ sign_count: creds[0].sign_count + 1 }),
    });

    // Issue session via magic link
    const linkRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}/generate-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` },
        body: JSON.stringify({ type: 'magiclink' }),
    });
    if (!linkRes.ok) return Response.json({ error: 'Failed to create session' }, { status: 500 });

    const { properties } = await linkRes.json();
    const tokenRes = await fetch(`${env.SUPABASE_URL}/auth/v1/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': env.SUPABASE_SERVICE_KEY },
        body: JSON.stringify({ type: 'magiclink', token: properties.hashed_token, redirect_to: '/' }),
    });
    if (!tokenRes.ok) return Response.json({ error: 'Failed to issue session' }, { status: 500 });

    const session = await tokenRes.json();
    return Response.json({ access_token: session.access_token, refresh_token: session.refresh_token, user: session.user });
}
