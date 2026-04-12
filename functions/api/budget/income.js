import { requireAuth, unauthorized } from '../_auth.js';

// GET /api/budget/income?year=2026&month=4
// Returns income entries for the given month.
// If none exist, returns entries copied from the previous month as a template
// (flagged so the UI knows they are not yet saved for this month).
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

    // Try to get this month's income
    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/monthly_income?year=eq.${year}&month=eq.${month}&select=*`,
        { headers }
    );
    const data = await res.json();

    if (data.length) return Response.json(data);

    // Nothing saved yet — return empty array (budget.js will leave fields blank)
    return Response.json([]);
}

// POST /api/budget/income
// Upserts income entries for the given month.
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
        user_name: e.user_name,
        year,
        month,
        amount: e.amount,
    }));

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/monthly_income`, {
        method: 'POST',
        headers,
        body: JSON.stringify(records),
    });

    if (!res.ok) return Response.json({ error: await res.text() }, { status: res.status });
    return Response.json(await res.json());
}
