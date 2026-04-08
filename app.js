import {
    checkSession,
    clearSession
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


export function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.className = 'toast', 3500);
}


// ── Online / Offline banner ──────────────────────────────────────────────────

function updateOnlineStatus() {
    document.getElementById('offlineBanner').classList.toggle('visible', !navigator.onLine);
}
window.addEventListener('online', () => {
    updateOnlineStatus();
    flushPending(); // Firefox fallback: flush queued expenses when back online
});
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// ── Default date ─────────────────────────────────────────────────────────────

document.getElementById('date').valueAsDate = new Date();


// ── Categories ───────────────────────────────────────────────────────────────

const DEFAULT_CATEGORIES = [
    'Groceries', 'Food & Drinks', 'Accommodation', 'Car', 'Fuel', 'Tolls', 'Parking',
    'Travelling', 'Culture', 'Health', 'School', 'Sports', 'Utilities',
    'House 50/50', 'Others', 'House - Mortgage', 'House - Insurance',
    'House - Condominium', 'House - Others'
];

async function loadCategories() {
    const status = document.getElementById('categoryStatus');

    // Load from cache first so the select is never empty
    const cached = localStorage.getItem('categories');
    populateCategories(cached ? JSON.parse(cached) : DEFAULT_CATEGORIES);

    // Fetch live from Pages Function in background
    try {
        const res = await fetch('/api/categories');
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

loadCategories();

// ── IndexedDB offline queue ───────────────────────────────────────────────────
// Duplicated from sw.js so Firefox can flush pending on page load
// (Firefox doesn't support Background Sync)

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

// Firefox-safe flush: called on page load and when coming back online
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

    let flushed = 0;
    for (const item of pending) {
        try {
            const res = await fetch(item.url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: item.body,
            });
            if (res.ok) {
                await deletePending(db, item.id);
                flushed++;
            }
        } catch { /* will retry next time */ }
    }
    if (flushed > 0) showToast(`✓ ${flushed} offline expense${flushed > 1 ? 's' : ''} synced`, 'success');
}

// Flush any pending expenses on page load (Firefox fallback)
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

    // Queue offline if no connection
    if (!navigator.onLine) {
        await queueOffline(payload);
        // Background Sync for Chrome/Android
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const reg = await navigator.serviceWorker.ready;
            await reg.sync.register('pending-expenses');
        }
        showToast('Saved offline — will sync when reconnected', 'success');
        resetForm(form, btn);
        return;
    }

    try {
        const res = await fetch('/api/expenses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
            showToast('✓ Expense logged!', 'success');
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
    resetSubmitBtn(btn);
}

function resetSubmitBtn(btn) {
    btn.disabled = false;
    btn.innerHTML = 'Submit Expense';
}
