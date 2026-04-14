import { requireAuth, unauthorized } from './_auth.js';

const TABLE = 'expenses';

export async function onRequestPost(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

    for (const field of ['date', 'description', 'category', 'amount', 'shared', 'paid_by']) {
        if (body[field] === undefined || body[field] === '')
            return Response.json({ error: `Missing field: ${field}` }, { status: 400 });
    }

    if (body.shared === 'No' && body.paid_by === 'Joint')
        return Response.json({ error: 'Joint is not allowed for non-shared expenses' }, { status: 400 });

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${TABLE}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Prefer': 'return=representation',
        },
        body: JSON.stringify({
            description: body.description, amount: body.amount, date: body.date,
            category: body.category, shared: body.shared, paid_by: body.paid_by,
            created_by: user.id,
        }),
    });

    if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
    const data = await res.json();
    return Response.json(data[0], { status: 201 });
}

export async function onRequestGet(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

    // Get user's display name for visibility filtering
    /*const prefRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${user.id}&select=display_name`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    const prefData = await prefRes.json();
    const displayName = prefData[0]?.display_name;*/
    const displayName = JSON.parse(localStorage.getItem('user_preferences')).display_name

    // Visibility: shared=Yes OR paid_by matches user's display name
    const visibilityFilter = displayName
        ? `or=(shared.eq.Yes,paid_by.eq.${displayName})`
        : `shared=eq.Yes`;

    // Optional filters from query params
    const url = new URL(request.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const category = url.searchParams.get('category');
    const paidBy = url.searchParams.get('paid_by');

    const filters = [visibilityFilter];
    if (from) filters.push(`date=gte.${from}`);
    if (to) filters.push(`date=lte.${to}`);
    if (category) filters.push(`category=eq.${encodeURIComponent(category)}`);
    if (paidBy) filters.push(`paid_by=eq.${encodeURIComponent(paidBy)}`);

    const query = filters.join('&');

    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/${TABLE}?select=*&${query}&order=date.desc&limit=200`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
    return Response.json(await res.json());
}
