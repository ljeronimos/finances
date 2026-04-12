import { checkSession, clearSession } from './auth.js';

(async () => {
    const { valid, session } = await checkSession();
    if (!valid) { window.location.replace('/login.html'); return; }

    const displayName = session.user?.user_metadata?.display_name
        || localStorage.getItem('display_name')
        || session.user?.email;
    document.getElementById('userBadge').textContent = displayName;
})();

document.getElementById('signOutBtn').addEventListener('click', () => {
    clearSession();
    window.location.replace('/login.html');
});

// ── Period tab switching ───────────────────────────────────────────────────────

document.querySelectorAll('.period-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // Backend will wire up real data here
    });
});
