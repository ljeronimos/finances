const EXPENSES_TABLE = 'expenses';

// POST /api/expenses — insert a new expense
export async function onRequestPost(context) {
    const { request, env } = context;

    let body;
    try {
        body = await request.json();
    } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate required fields
    const required = ['date', 'description', 'category', 'amount', 'shared', 'paid_by'];
    for (const field of required) {
        if (body[field] === undefined || body[field] === '') {
            return Response.json({ error: `Missing required field: ${field}` }, { status: 400 });
        }
    }

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${EXPENSES_TABLE}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': env.SUPABASE_SERVICE_KEY,
            'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'Prefer': 'return=representation',
        },
        body: JSON.stringify({
            description: body.description,
            amount: body.amount,
            date: body.date,
            category: body.category,
            shared: body.shared,
            paid_by: body.paid_by,
        }),
    });

    if (!res.ok) {
        const error = await res.text();
        return Response.json({ error }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data[0], { status: 201 });
}

// GET /api/expenses — fetch recent expenses
export async function onRequestGet(context) {
    const { env } = context;

    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/${EXPENSES_TABLE}?select=*&order=date.desc&limit=50`,
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
    return Response.json(data);
}
