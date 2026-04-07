// ── auth.js — shared browser utilities ───────────────────────────────────────
// Imported by app.js, login.js, settings.js

// ── Service Worker registration ───────────────────────────────────────────────

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.warn);
}

// ── Toast ─────────────────────────────────────────────────────────────────────

export function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.className = 'toast', 3500);
}

// ── Online / Offline banner ───────────────────────────────────────────────────

export function initOfflineBanner() {
    const banner = document.getElementById('offlineBanner');
    if (!banner) return;
    function update() {
        banner.classList.toggle('visible', !navigator.onLine);
    }
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
}

// ── Session management ────────────────────────────────────────────────────────

const SESSION_KEY = 'finances_session';

export function saveSession(accessToken, refreshToken, user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        accessToken,
        refreshToken,
        user,
        savedAt: Date.now(),
    }));
}

export function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

export function getAuthHeaders() {
    const session = getSession();
    if (!session) return { 'Content-Type': 'application/json' };
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.accessToken}`,
    };
}

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

// ── WebAuthn helpers ──────────────────────────────────────────────────────────

export const webAuthnSupported = () =>
    typeof window.PublicKeyCredential === 'function';

export function base64urlToBuffer(base64url) {
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(base64);
    return Uint8Array.from(binary, c => c.charCodeAt(0)).buffer;
}

export function bufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function registerWebAuthn(accessToken) {
    const challengeRes = await fetch('/api/auth/webauthn-register-challenge', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
    });
    if (!challengeRes.ok) throw new Error('Failed to get registration challenge');
    const options = await challengeRes.json();

    const credential = await navigator.credentials.create({
        publicKey: {
            ...options,
            challenge: base64urlToBuffer(options.challenge),
            user: {
                ...options.user,
                id: new TextEncoder().encode(options.user.id),
            },
        },
    });

    const verifyRes = await fetch('/api/auth/webauthn-register-verify', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
            challengeId: options.challengeId,
            credentialId: bufferToBase64url(credential.rawId),
            clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
            attestationObject: bufferToBase64url(credential.response.attestationObject),
            deviceName: getDeviceName(),
        }),
    });

    if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Registration failed');
    }
    return true;
}

export async function loginWithWebAuthn(email) {
    const challengeRes = await fetch('/api/auth/webauthn-login-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });
    if (!challengeRes.ok) {
        const err = await challengeRes.json();
        throw new Error(err.error || 'Failed to get login challenge');
    }
    const options = await challengeRes.json();

    const assertion = await navigator.credentials.get({
        publicKey: {
            challenge: base64urlToBuffer(options.challenge),
            allowCredentials: options.allowCredentials.map(c => ({
                ...c,
                id: base64urlToBuffer(c.id),
            })),
            timeout: options.timeout,
            userVerification: options.userVerification,
        },
    });

    const verifyRes = await fetch('/api/auth/webauthn-login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            challengeId: options.challengeId,
            userId: options.userId,
            credentialId: bufferToBase64url(assertion.rawId),
            clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
            authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
            signature: bufferToBase64url(assertion.response.signature),
        }),
    });

    if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Authentication failed');
    }

    const data = await verifyRes.json();
    saveSession(data.access_token, data.refresh_token, data.user);
    return data;
}

export function getDeviceName() {
    const ua = navigator.userAgent;
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/iPad/.test(ua)) return 'iPad';
    if (/Android/.test(ua) && /Mobile/.test(ua)) return 'Android Phone';
    if (/Android/.test(ua)) return 'Android Tablet';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Linux/.test(ua)) return 'Linux';
    return 'Unknown device';
}
