import { requireAuth, unauthorized } from '../_auth.js';

export async function onRequestPost(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { challengeId, credentialId, clientDataJSON, attestationObject, deviceName } = body;
    if (!challengeId || !credentialId || !clientDataJSON)
        return Response.json({ error: 'Missing required fields' }, { status: 400 });

    const challengeRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/webauthn_challenges?id=eq.${challengeId}&user_id=eq.${user.id}`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    const challenges = await challengeRes.json();
    if (!challenges.length) return Response.json({ error: 'Challenge not found' }, { status: 400 });

    const rec = challenges[0];
    if (Date.now() - new Date(rec.created_at).getTime() > 5 * 60 * 1000)
        return Response.json({ error: 'Challenge expired' }, { status: 400 });

    const clientData = JSON.parse(atob(clientDataJSON.replace(/-/g, '+').replace(/_/g, '/')));
    if (clientData.challenge !== rec.challenge) return Response.json({ error: 'Challenge mismatch' }, { status: 400 });
    if (clientData.type !== 'webauthn.create') return Response.json({ error: 'Invalid type' }, { status: 400 });

    await fetch(`${env.SUPABASE_URL}/rest/v1/webauthn_challenges?id=eq.${challengeId}`,
        { method: 'DELETE', headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );

    const storeRes = await fetch(`${env.SUPABASE_URL}/rest/v1/webauthn_credentials`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Prefer': 'return=representation',
        },
        body: JSON.stringify({
            user_id: user.id, credential_id: credentialId,
            public_key: attestationObject, device_name: deviceName || 'Unknown device', sign_count: 0,
        }),
    });

    if (!storeRes.ok) return Response.json({ error: await storeRes.text() }, { status: 500 });
    return Response.json({ success: true });
}
