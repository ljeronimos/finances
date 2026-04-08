const SESSION_KEY = 'finances_session';

// Validates session:
// - Offline: trust cached session
// - Online: verify with server, refresh if needed
export async function checkSession() {
    const session = getSession();

    if (!navigator.onLine) {
        return session ? { valid: true, session, offline: true } : { valid: false };
    }

    if (!session) return { valid: false };

    try {
        const res = await fetch('/api/auth/session-check', {
            headers: { 'Authorization': `Bearer ${session.accessToken}` },
        });

        if (res.ok) return { valid: true, session, offline: false };

        // Try token refresh
        const refreshed = await refreshSession(session.refreshToken);
        if (refreshed) return { valid: true, session: getSession(), offline: false };

        clearSession();
        return { valid: false };
    } catch {
        // Network error — trust cached session
        return session ? { valid: true, session, offline: true } : { valid: false };
    }
}

export function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function refreshSession(refreshToken) {
    try {
        const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        saveSession(data.access_token, data.refresh_token, data.user);
        return true;
    } catch {
        return false;
    }
}

export function saveSession(accessToken, refreshToken, user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        accessToken,
        refreshToken,
        user,
        savedAt: Date.now(),
    }));
}

export function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}