import {
    checkSession,
    clearSession,
    getAuthHeaders,
    getSession,
    showToast,
    initOfflineBanner,
} from './auth.js';

// ── Session check ─────────────────────────────────────────────────────────────

(async () => {
    const { valid, session, offline } = await checkSession();

    if (!valid) {
        window.location.replace('/login.html');
        return;
    }

    // Show user badge
    const displayName = session.user?.user_metadata?.display_name
        || localStorage.getItem('display_name')
        || session.user?.email;
    document.getElementById('userBadge').textContent = displayName;

    loadCategories();

    if (!offline) applyDefaultPreferences();
})();

// ── Sign out ──────────────────────────────────────────────────────────────────

document.getElementById('signOutBtn').addEventListener('click', () => {
    clearSession();
    window.location.replace('/login.html');
});

// ── Online / Offline banner ───────────────────────────────────────────────────

initOfflineBanner();

window.addEventListener('online', flushPending);

// ── Default date ──────────────────────────────────────────────────────────────

document.getElementById('date').valueAsDate = new Date();

// ── Default preferences ───────────────────────────────────────────────────────

async function applyDefaultPreferences() {
    try {
        const res = await fetch('/api/settings', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const prefs = data.preferences;

        if (prefs?.display_name) {
            localStorage.setItem('display_name', prefs.display_name);
            document.getElementById('userBadge').textContent = prefs.display_name;
        }

        if (prefs?.default_paid_by) {
            const radio = document.querySelector(`input[name="paidBy"][value="${prefs.default_paid_by}"]`);
            if (radio) radio.checked = true;
        }

        if (prefs?.default_shared) {
            const radio = document.querySelector(`input[name="shared"][value="${prefs.default_shared}"]`);
            if (radio) {
                radio.checked = true;
                updateJointOption(prefs.default_shared);
            }
        }
    } catch {
        // Preferences are a convenience, not critical
    }
}

// ── Shared / Joint validation ─────────────────────────────────────────────────

function updateJointOption(sharedValue) {
    const jointOption = document.getElementById('paidJointOption');
    const jointRadio = document.getElementById('paid_joint');

    if (sharedValue === 'No') {
        jointOption.classList.add('disabled');
        jointRadio.disabled = true;
        if (jointRadio.checked) jointRadio.checked = false;
    } else {
        jointOption.classList.remove('disabled');
        jointRadio.disabled = false;
    }
}

document.querySelectorAll('input[name="shared"]').forEach(radio => {
    radio.addEventListener('change', e => updateJointOption(e.target.value));
});

// ── Categories ────────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
    'Groceries', 'Food & Drinks', 'Accommodation', 'Car', 'Fuel', 'Tolls', 'Parking',
    'Travelling', 'Culture', 'Health', 'School', 'Sports', 'Utilities',
    'House 50/50', 'Others', 'House - Mortgage', 'House - Insurance',
    'House - Condominium', 'House - Others'
];

async function loadCategories() {
    const status = document.getElementById('categoryStatus');
    const cached = localStorage.getItem('categories');
    populateCategories(cached ? JSON.parse(cached) : DEFAULT_CATEGORIES);

    if (!navigator.onLine) return;

    try {
        const res = await fetch('/api/categories', { headers: getAuthHeaders() });
        if (res.ok) {
            const data = await res.json();
            const categories = data.map(r => r.category);
            localStorage.setItem('categories', JSON.stringify(categories));
            populateCategories(categories);
        }
    } catch {
        if (!cached) status.textContent = 'Using default categories — open online to refresh.';
    }
}

function populateCategories(categories) {
    const select = document.getElementById('category');
    select.innerHTML = '<option value="" disabled selected>Select a category</option>';
    categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
    });
}

// ── IndexedDB offline queue ───────────────────────────────────────────────────

function openDB() {
    return new Promise((res, rej) => {
        const req = indexedDB.open('expenses-offline', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
        req.onsuccess = e => res(e.target.result);
        req.onerror = rej;
    });
}

function getAllPending(db) {
    return new Promise((res, rej) => {
        const tx = db.transaction('pending', 'readonly');
        const req = tx.objectStore('pending').getAll();
        req.onsuccess = e => res(e.target.result);
        req.onerror = rej;
    });
}

function deletePending(db, id) {
    return new Promise((res, rej) => {
        const tx = db.transaction('pending', 'readwrite');
        const req = tx.objectStore('pending').delete(id);
        req.onsuccess = res;
        req.onerror = rej;
    });
}

async function queueOffline(payload) {
    const db = await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction('pending', 'readwrite');
        tx.objectStore('pending').add({
            url: '/api/expenses',
            body: JSON.stringify(payload),
            ts: Date.now(),
        });
        tx.oncomplete = res;
        tx.onerror = rej;
    });
}

// Flush queued expenses — called on load and when back online (Firefox fallback)
async function flushPending() {
    if (!navigator.onLine) return;
    let db;
    try {
        db = await openDB();
    } catch {
        return;
    }
    const pending = await getAllPending(db);
    if (pending.length === 0) return;

    const session = getSession();
    const headers = {
        'Content-Type': 'application/json',
        ...(session ? { 'Authorization': `Bearer ${session.accessToken}` } : {}),
    };

    let flushed = 0;
    for (const item of pending) {
        try {
            const res = await fetch(item.url, { method: 'POST', headers, body: item.body });
            if (res.ok) {
                await deletePending(db, item.id);
                flushed++;
            }
        } catch { /* retry next time */ }
    }
    if (flushed > 0) showToast(`✓ ${flushed} offline expense${flushed > 1 ? 's' : ''} synced`);
}

window.addEventListener('load', flushPending);

// ── Form submit ───────────────────────────────────────────────────────────────

document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const shared = form.querySelector('input[name="shared"]:checked');
    const paidBy = form.querySelector('input[name="paidBy"]:checked');

    if (!shared || !paidBy) {
        showToast('Please select all options.', 'error');
        return;
    }

    if (shared.value === 'No' && paidBy.value === 'Joint') {
        showToast('Joint is not allowed for non-shared expenses.', 'error');
        return;
    }

    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Submitting…';

    const payload = {
        description: document.getElementById('description').value.trim(),
        amount: parseFloat(document.getElementById('amount').value),
        date: document.getElementById('date').value,
        category: document.getElementById('category').value,
        shared: shared.value,
        paid_by: paidBy.value,
    };

    if (!navigator.onLine) {
        await queueOffline(payload);
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const reg = await navigator.serviceWorker.ready;
            await reg.sync.register('pending-expenses');
        }
        showToast('Saved offline — will sync when reconnected');
        resetForm(form, btn);
        return;
    }

    try {
        const res = await fetch('/api/expenses', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
            showToast('✓ Expense logged!');
            resetForm(form, btn);
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
        resetSubmitBtn(btn);
    }
});

function resetForm(form, btn) {
    form.reset();
    document.getElementById('date').valueAsDate = new Date();
    applyDefaultPreferences();
    resetSubmitBtn(btn);
}

function resetSubmitBtn(btn) {
    btn.disabled = false;
    btn.innerHTML = 'Submit Expense';
}
