import { checkSession, clearSession, showToast, getAuthHeaders } from './auth.js';

// ── Session check ─────────────────────────────────────────────────────────────

(async () => {
    const { valid, session, offline } = await checkSession();
    if (!valid) { window.location.replace('/login.html'); return; }

    const displayName = JSON.parse(localStorage.getItem('user_preferences')).display_name
        || session.user?.email;

    /*const displayName = session.user?.user_metadata?.display_name
        || localStorage.getItem('display_name')
        || session.user?.email;*/
    document.getElementById('userBadge').textContent = displayName;

    const banner = document.getElementById('offlineBanner');
    if (offline && banner) banner.classList.add('visible');

    loadCategories();
    loadExpenses();
})();

// ── Sign out ──────────────────────────────────────────────────────────────────

document.getElementById('signOutBtn').addEventListener('click', () => {
    clearSession();
    window.location.replace('/login.html');
});

// ── Date range helpers ────────────────────────────────────────────────────────

function getDateRange(period) {

    console.log("On getDateRange - period:",period);

    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    let fromDate = new Date(y, m, 1);
    let toDate = new Date(y, m + 1, 0);
    let label = now.toLocaleString('default', { month: 'long', year: 'numeric' });

    
    switch (period) {
        case 'this_month':
            //return {
                //from: new Date(y, m, 1).toISOString().split('T')[0],
                //to: new Date(y, m + 1, 0).toISOString().split('T')[0],
                //label: now.toLocaleString('default', { month: 'long', year: 'numeric' }),
            //};
            break;
        case 'last_month':
            fromDate = new Date(y, m - 1, 1);
            toDate = new Date(y, m, 0);
            label = new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
            break;
            //return {
                //from: new Date(y, m - 1, 1).toISOString().split('T')[0],
                //to: new Date(y, m, 0).toISOString().split('T')[0],
                //label: new Date(y, m - 1).toLocaleString('default', { month: 'long', year: 'numeric' }),
            //};
        case 'last_3_months':
            fromDate = new Date(y, m - 2, 1);
            toDate = new Date(y, m + 1, 0);
            label = 'Last 3 months';
            break;
            //return {
                //from: new Date(y, m - 2, 1).toISOString().split('T')[0],
                //to: new Date(y, m + 1, 0).toISOString().split('T')[0],
                //label: 'Last 3 months',
            //};
        case 'last_6_months':
            fromDate = new Date(y, m - 5, 1);
            toDate = new Date(y, m + 1, 0);
            label = 'Last 6 months';
            break;
        case 'this_year':
            fromDate = new Date(y, 0, 1);
            toDate = new Date(y, 11, 31);
            label = `${y}`;
            break;
            //return {
                //from: new Date(y, 0, 1).toISOString().split('T')[0],
                //to: new Date(y, 11, 31).toISOString().split('T')[0],
                //label: `${y}`,
            //};
        case 'all':
        default:
            return { from: null, to: null, label: 'All time' };
    }


    return {
        from: formatSupabaseDate(fromDate),
        to: formatSupabaseDate(toDate),
        label: label
    };
}

// ── Load categories for filter ────────────────────────────────────────────────

function loadCategories() {
    const cached = localStorage.getItem('categories');
    const cats = cached ? Object.keys(JSON.parse(cached)) : [];
    const select = document.getElementById('filterCategory');
    cats.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
    });
}

// ── Load expenses ─────────────────────────────────────────────────────────────

async function loadExpenses() {
    const list = document.getElementById('expenseList');
    const totalEl = document.getElementById('totalAmount');
    const personalTotalEl = document.getElementById('personalTotal');
    const periodLabel = document.getElementById('periodLabel');

    const period = document.getElementById('filterPeriod').value;
    const category = document.getElementById('filterCategory').value;
    const paidBy = document.getElementById('filterPaidBy').value;

    const { from, to, label } = getDateRange(period);
    console.log("from/to/label:",from,to,label);
    periodLabel.textContent = label;

    // Build query params
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (category) params.set('category', category);
    if (paidBy) params.set('paid_by', paidBy);

    console.log("expenses params: ",params);

    list.innerHTML = '<div class="loading-state"><span class="spinner" style="border-top-color:var(--accent)"></span> Loading…</div>';
    totalEl.textContent = '—';
    personalTotalEl.textContent = '—';

    const prefs = JSON.parse(localStorage.getItem('user_preferences') || '{}');
    const categories = JSON.parse(localStorage.getItem('categories') || '{}');
    const shareColumn = prefs.share_column;

    function getUserRatio(category, shared) {
        if (shared === 'No') return 1;
        if (!shareColumn || !categories[category]) return 0.5;
        return categories[category][shareColumn] ?? 0.5;
    }

    try {
        const res = await fetch(`/api/expenses?${params}`, { headers: getAuthHeaders() });
        if (!res.ok) throw new Error('Failed to load expenses');
        const expenses = await res.json();

        if (!expenses.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">📭</div>
                    No expenses found for this period.
                </div>`;
            totalEl.textContent = '€0.00';
            personalTotalEl.textContent = '€0.00';
            return;
        }

        const total = expenses.reduce((sum, e) => sum + e.amount, 0);
        const personalTotal = expenses.reduce((sum, e) => sum + Number(e.amount) * getUserRatio(e.category, e.shared), 0);

        totalEl.textContent = `€${total.toFixed(2)}`;
        personalTotalEl.textContent = `€${personalTotal.toFixed(2)}`;

        list.innerHTML = expenses.map(e => {
            const personalAmount = Number(e.amount) * getUserRatio(e.category, e.shared);
            const showPersonal = personalAmount !== Number(e.amount);

            return `
            <div class="expense-item">
                <div class="expense-left">
                    <div class="expense-desc">${escapeHtml(e.description)}</div>
                    <div class="expense-meta">
                        <span>${formatDate(e.date)}</span>
                        <span class="expense-tag">${escapeHtml(e.category)}</span>
                        ${e.shared === 'Yes' ? '<span class="expense-tag expense-tag--shared">Shared</span>' : ''}
                    </div>
                </div>
                <div class="expense-right">
                    <div class="expense-amount">€${Number(e.amount).toFixed(2)}</div>
                    ${showPersonal ?
                        `<div class="expense-personal">€${personalAmount.toFixed(2)} yours</div>` :
                        ''}
                    <div class="expense-paid-by">${escapeHtml(e.paid_by)}</div>
                </div>
            </div>
        `}).join('');

    } catch (err) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">⚠️</div>${err.message}</div>`;
        showToast('Failed to load expenses', 'error');
    }
}

// ── Filter change listeners ───────────────────────────────────────────────────

['filterPeriod', 'filterCategory', 'filterPaidBy'].forEach(id => {
    document.getElementById(id).addEventListener('change', loadExpenses);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

//function formatSupabaseDate(y, m, d) {
//    return `${y}-${String(m+1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
//}

function formatSupabaseDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
