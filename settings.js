import {
    getSession,
    clearSession,
    getAuthHeaders,
    showToast,
    webAuthnSupported,
    registerWebAuthn,
} from './auth.js';

// ── Guard: redirect if not authenticated ─────────────────────────────────────

const session = getSession();
if (!session) window.location.replace('/login.html');

// ── Load settings ─────────────────────────────────────────────────────────────

let settingsData = null;

async function loadSettings() {
    try {
        const res = await fetch('/api/settings', { headers: getAuthHeaders() });
        if (!res.ok) { showToast('Failed to load settings', 'error'); return; }
        settingsData = await res.json();

        document.getElementById('userEmail').textContent = settingsData.email;
        document.getElementById('currentDisplayName').textContent =
            settingsData.preferences?.display_name || 'Not set';
        document.getElementById('defaultPaidBy').value =
            settingsData.preferences?.default_paid_by || '';
        document.getElementById('defaultShared').value =
            settingsData.preferences?.default_shared || '';

        renderDevices(settingsData.credentials);
    } catch {
        showToast('Failed to load settings', 'error');
    }
}

function renderDevices(credentials) {
    const list = document.getElementById('deviceList');
    const registerBtn = document.getElementById('registerDeviceBtn');

    if (!credentials.length) {
        list.innerHTML = '<div class="no-devices">No devices registered yet.</div>';
    } else {
        list.innerHTML = credentials.map(c => `
            <div class="device-item">
                <div>
                    <div class="device-name">📱 ${c.device_name}</div>
                    <div class="device-date">Added ${new Date(c.created_at).toLocaleDateString()}</div>
                </div>
                <button class="btn-small btn-danger" data-id="${c.id}">Remove</button>
            </div>
        `).join('');

        list.querySelectorAll('[data-id]').forEach(btn => {
            btn.addEventListener('click', () => removeDevice(btn.dataset.id));
        });
    }

    if (webAuthnSupported()) registerBtn.style.display = 'block';
}

// ── Remove device ─────────────────────────────────────────────────────────────

async function removeDevice(id) {
    const res = await fetch(`/api/credentials?id=${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
    });
    if (res.ok) {
        showToast('Device removed');
        loadSettings();
    } else {
        showToast('Failed to remove device', 'error');
    }
}

// ── Register this device ──────────────────────────────────────────────────────

document.getElementById('registerDeviceBtn').addEventListener('click', async () => {
    const btn = document.getElementById('registerDeviceBtn');
    btn.disabled = true;
    btn.textContent = 'Waiting for biometric…';
    try {
        await registerWebAuthn(session.accessToken);
        showToast('Device registered!');
        loadSettings();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = '🔐 Register this device';
    }
});

// ── Edit display name ─────────────────────────────────────────────────────────

document.getElementById('editNameBtn').addEventListener('click', () => {
    document.getElementById('newDisplayName').value =
        settingsData?.preferences?.display_name || '';
    document.getElementById('editNameModal').classList.add('visible');
});

document.getElementById('cancelNameBtn').addEventListener('click', () => {
    document.getElementById('editNameModal').classList.remove('visible');
});

document.getElementById('saveNameBtn').addEventListener('click', async () => {
    const name = document.getElementById('newDisplayName').value.trim();
    if (!name) { showToast('Please enter a name', 'error'); return; }
    const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ display_name: name }),
    });
    if (res.ok) {
        showToast('Name updated');
        document.getElementById('editNameModal').classList.remove('visible');
        loadSettings();
    } else {
        showToast('Failed to update name', 'error');
    }
});

// ── Save preferences ──────────────────────────────────────────────────────────

document.getElementById('savePrefsBtn').addEventListener('click', async () => {
    const btn = document.getElementById('savePrefsBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Saving…';
    const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            default_paid_by: document.getElementById('defaultPaidBy').value,
            default_shared: document.getElementById('defaultShared').value,
        }),
    });
    if (res.ok) {
        showToast('Preferences saved');
        loadSettings();
    } else {
        showToast('Failed to save', 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Save Preferences';
});

// ── Change password ───────────────────────────────────────────────────────────

document.getElementById('changePasswordBtn').addEventListener('click', async () => {
    const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: settingsData.email }),
    });
    if (res.ok) showToast('Reset email sent');
    else showToast('Failed to send email', 'error');
});

// ── Sign out ──────────────────────────────────────────────────────────────────

document.getElementById('signOutBtn').addEventListener('click', () => {
    clearSession();
    window.location.replace('/login.html');
});

// ── Delete account ────────────────────────────────────────────────────────────

document.getElementById('deleteAccountBtn').addEventListener('click', () => {
    document.getElementById('deleteModal').classList.add('visible');
});

document.getElementById('cancelDeleteBtn').addEventListener('click', () => {
    document.getElementById('deleteModal').classList.remove('visible');
});

document.getElementById('confirmDeleteBtn').addEventListener('click', async () => {
    const res = await fetch('/api/settings', {
        method: 'DELETE',
        headers: getAuthHeaders(),
    });
    if (res.ok) {
        clearSession();
        window.location.replace('/login.html');
    } else {
        showToast('Failed to delete account', 'error');
    }
});

// ── Init ──────────────────────────────────────────────────────────────────────

loadSettings();
