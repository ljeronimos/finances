//const EXPENSES_API_URL = 
//const API_KEY    =

const apiHeaders = {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
};

// Offline banner
function updateOnlineStatus() {
    document.getElementById('offlineBanner').classList.toggle('visible', !navigator.onLine);
}
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();

// Default date
document.getElementById('date').valueAsDate = new Date();

// Toast
function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast ${type} show`;
    setTimeout(() => t.className = 'toast', 3500);
}

// IndexedDB offline queue
function openDB() {
    return new Promise((res, rej) => {
        const req = indexedDB.open('expenses-offline', 1);
        req.onupgradeneeded = e => e.target.result.createObjectStore('pending', { keyPath: 'id', autoIncrement: true });
        req.onsuccess = e => res(e.target.result);
        req.onerror = rej;
    });
}
async function queueOffline(payload) {
    const db = await openDB();
    return new Promise((res, rej) => {
        const tx = db.transaction('pending', 'readwrite');
        tx.objectStore('pending').add({
            url: `${EXPENSES_API_URL}/addExpense`,
            body: JSON.stringify(payload),
            apiKey: API_KEY,
            ts: Date.now()
        });
        tx.oncomplete = res;
        tx.onerror = rej;
    });
}

// Form submit
document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const shared = form.querySelector('input[name="shared"]:checked');
    const paidBy = form.querySelector('input[name="paidBy"]:checked');

    validateInput(shared, paidBy);

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
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            const reg = await navigator.serviceWorker.ready;
            await reg.sync.register('pending-expenses');
        }
        showToast('Saved offline — will sync when online', 'success');
        form.reset();
        document.getElementById('date').valueAsDate = new Date();
        resetSubmitBtn(btn);
        return;
    }

    try {
        const res = await fetch(`${EXPENSES_API_URL}/addExpense`, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok) {
            showToast('✓ Expense logged!', 'success');
            form.reset();
            document.getElementById('date').valueAsDate = new Date();
        } else {
            throw new Error(data.error || 'Unknown error');
        }
    } catch (err) {
        showToast(`Error: ${err.message}`, 'error');
    } finally {
        resetSubmitBtn(btn);
    }
});

function validateInput(shared, paidBy){
    if (!shared || !paidBy) {
        showToast('Please select all options.', 'error'); 
        return;
    }
}

function resetSubmitBtn(btn){
    btn.disabled = false;
    btn.innerHTML = 'Submit Expense';
}