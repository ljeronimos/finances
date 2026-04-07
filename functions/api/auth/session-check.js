import { requireAuth, unauthorized } from '../_auth.js';

export async function onRequestGet(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();
    return Response.json({ valid: true, user_id: user.id });
}
