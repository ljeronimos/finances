export async function onRequestGet(context) {
    const { env } = context;

    const CATEGORY_TABLE = 'categories';

    const res = await fetch(
        //`${env.SUPABASE_URL}/rest/v1/${CATEGORY_TABLE}?select=category&order=category`,
        `${env.SUPABASE_URL}/rest/v1/${CATEGORY_TABLE}?select=category,luis_share,sara_share&order=category`,
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
