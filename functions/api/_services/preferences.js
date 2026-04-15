export async function getUserPreferences(env, userId) {

    const headers = {
        'apikey': env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    };

    const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/user_preferences?user_id=eq.${userId}`,
        { headers }
    );

    if (!res.ok) {
        throw new Error('Failed to fetch preferences');
    }

    const data = await res.json();
    return data.length ? data[0] : {};
}