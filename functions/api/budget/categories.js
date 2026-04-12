import { requireAuth, unauthorized } from '../_auth.js';

// GET /api/budget/categories?year=2026&month=4
// Returns budget entries for the given month.
// If none exist, copies the previous month as a template.
export async function onRequestGet(context) {
    const { request, env } = context;
    const { error } = await requireAuth(request, env);
    if (error) return unauthorized();

    const url = new URL(request.url);
    const year = parseInt(url.searchParams.get('year'));
    const month = parseInt(url.searchParams.get('month'));

    if (!year || !month) return Response.json({ error: 'year and month required' }, { status: 400 });

    const headers = {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    // Try this month first
    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/monthly_budget?year=eq.${year}&month=eq.${month}&select=*&order=category`,
        { headers }
    );
    const data = await res.json();
    if (data.length) return Response.json(data);

    // Nothing saved — look for previous month as template
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) { prevMonth = 12; prevYear--; }

    const prevRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/monthly_budget?year=eq.${prevYear}&month=eq.${prevMonth}&select=*&order=category`,
        { headers }
    );
    const prevData = await prevRes.json();

    // Return previous month's data flagged as template (not yet saved for this month)
    const template = prevData.map(r => ({
        ...r,
        id: null,          // signal to client: not saved for this month yet
        year,
        month,
        is_template: true,
    }));

    return Response.json(template);
}

// POST /api/budget/categories
// Upserts budget entries for the given month.
export async function onRequestPost(context) {
    const { request, env } = context;
    const { error } = await requireAuth(request, env);
    if (error) return unauthorized();

    let body;
    try { body = await request.json(); }
    catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }

    const { year, month, entries } = body;
    if (!year || !month || !Array.isArray(entries)) {
        return Response.json({ error: 'year, month and entries required' }, { status: 400 });
    }

    const headers = {
        'Content-Type': 'application/json',
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates,return=representation',
    };

    const records = entries.map(e => ({
        category: e.category,
        year,
        month,
        amount: e.amount,
    }));

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/monthly_budget`, {
        method: 'POST',
        headers,
        body: JSON.stringify(records),
    });

    if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
    return Response.json(await res.json());
}
