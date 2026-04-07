import { requireAuth, unauthorized } from '../_auth.js';

export async function onRequestPost(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

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
        challengeId: record.id,
        challenge,
        rp: { name: 'My Finances' },
        user: { id: user.id, name: user.email, displayName: user.email },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
    });
}
