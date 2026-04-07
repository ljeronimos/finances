export async function requireAuth(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return { user: null, error: 'Missing token' };

    const token = authHeader.slice(7);
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${token}`,
        },
    });

    if (!res.ok) return { user: null, error: 'Invalid token' };
    const user = await res.json();
    return { user, error: null };
}

export function unauthorized(message = 'Unauthorized') {
    return Response.json({ error: message }, { status: 401 });
}
