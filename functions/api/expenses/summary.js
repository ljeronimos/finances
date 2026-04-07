import { requireAuth, unauthorized } from '../_auth.js';

export async function onRequestGet(context) {
    const { request, env } = context;
    const { user, error } = await requireAuth(request, env);
    if (error) return unauthorized();

    const prefRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${user.id}&select=display_name`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    const prefData = await prefRes.json();
    const displayName = prefData[0]?.display_name;

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const filter = displayName ? `or=(shared.eq.Yes,paid_by.eq.${displayName})` : `shared=eq.Yes`;

    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/expenses?select=category,amount,shared,paid_by&${filter}&date=gte.${firstDay}&date=lte.${lastDay}`,
        { headers: { 'apikey': env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });

    const data = await res.json();
    const summary = data.reduce((acc, row) => {
        acc[row.category] = (acc[row.category] || 0) + row.amount;
        return acc;
    }, {});

    return Response.json({
        month: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        total: data.reduce((sum, r) => sum + r.amount, 0),
        by_category: summary,
    });
}
