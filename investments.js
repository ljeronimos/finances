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
