const EXPENSES_TABLE = 'expenses';

// GET /api/expenses/summary — total per category for current month
export async function onRequestGet(context) {
    const { env } = context;

    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/${EXPENSES_TABLE}?select=category,amount,shared,paid_by&date=gte.${firstDay}&date=lte.${lastDay}`,
        {
            headers: {
                'apikey': env.SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            },
        }
    );

    if (!res.ok) {
        const error = await res.text();
        return Response.json({ error }, { status: res.status });
    }

    const data = await res.json();

    // Aggregate totals per category client-side
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
