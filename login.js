import {
    checkSession,
    saveSession
} from './auth.js';

import { showToast } from './app.js';

// ── Redirect if already logged in ────────────────────────────────────────────

(async () => {
    const { valid } = await checkSession();
    if (valid) window.location.replace('/index.html');
})();

// ── Offline handling ──────────────────────────────────────────────────────────

function updateOfflineState() {
    const offline = !navigator.onLine;
    document.getElementById('offlineLoginMsg').classList.toggle('visible', offline);
    document.getElementById('loginContent').style.display = offline ? 'none' : 'block';
}
window.addEventListener('online', updateOfflineState);
window.addEventListener('offline', updateOfflineState);
updateOfflineState();


// ── Email / password login ────────────────────────────────────────────────────

async function doEmailLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !password) {
        showToast('Please enter email and password', 'error');
        return;
    }

    const btn = document.getElementById('loginBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Signing in…';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        saveSession(data.access_token, data.refresh_token, data.user);
        window.location.replace('/index.html');
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

document.getElementById('loginBtn').addEventListener('click', doEmailLogin);

document.getElementById('password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doEmailLogin();
});

// ── Forgot password ───────────────────────────────────────────────────────────

document.getElementById('forgotBtn').addEventListener('click', async () => {
    const email = document.getElementById('email').value.trim();
    if (!email) {
        showToast('Enter your email first', 'error');
        return;
    }
    const btn = document.getElementById('forgotBtn');
    btn.disabled = true;
    try {
        await fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        showToast('Password reset email sent', 'success');
    } catch {
        showToast('Failed to send reset email', 'error');
    } finally {
        btn.disabled = false;
    }
});