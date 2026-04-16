import { checkSession, clearSession, showToast, getAuthHeaders } from './auth.js';

// ── State ─────────────────────────────────────────────────────────────────────

const now = new Date();
let currentYear = now.getFullYear();
let currentMonth = now.getMonth() + 1; // 1-12

let totalIncome = 0;
let budgetValues = {};   // { category: amount }
let spentValues = {};    // { category: amount } — from expenses API
let hasUnsavedBudget = false;

//const CATEGORIES = Object.keys(JSON.parse(localStorage.getItem('categories'))) || [];
const CATEGORIES = JSON.parse(localStorage.getItem('categories') || '{}');

// ── Session check ─────────────────────────────────────────────────────────────

(async () => {
    const { valid, session } = await checkSession();
    if (!valid) { window.location.replace('/login.html'); return; }

    const displayName = JSON.parse(localStorage.getItem('user_preferences')).display_name
        || session.user?.email;

    document.getElementById('userBadge').textContent = displayName;

    renderMonthLabel();
    await loadAll();
})();

// ── Sign out ──────────────────────────────────────────────────────────────────

document.getElementById('signOutBtn').addEventListener('click', () => {
    clearSession();
    window.location.replace('/login.html');
});

// ── Month navigation ──────────────────────────────────────────────────────────

function renderMonthLabel() {
    const d = new Date(currentYear, currentMonth - 1, 1);
    document.getElementById('monthLabel').textContent =
        d.toLocaleString('default', { month: 'long', year: 'numeric' });
}

document.getElementById('prevMonth').addEventListener('click', async () => {
    if (hasUnsavedBudget && !confirm('You have unsaved budget changes. Leave anyway?')) return;
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    hasUnsavedBudget = false;
    renderMonthLabel();
    await loadAll();
});

document.getElementById('nextMonth').addEventListener('click', async () => {
    if (hasUnsavedBudget && !confirm('You have unsaved budget changes. Leave anyway?')) return;
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    hasUnsavedBudget = false;
    renderMonthLabel();
    await loadAll();
});

// ── Load everything for current month ────────────────────────────────────────

async function loadAll() {
    await Promise.all([
        loadIncome(),
        loadBudget(),
        loadSpent(),
    ]);
    renderBudgetList();
    updateSummary();
}

// ── Income ────────────────────────────────────────────────────────────────────

const incomeGrid = document.getElementById('income-grid');

incomeGrid.addEventListener('click', e => {
    if (e.target.classList.contains('editable')) {
        makeEditable(e.target);
    }
});

function makeEditable(span) {

    console.log("Displayed income pressed. Making editable...");

    const oldValue = span.textContent.replace(',', '.');
    const input = document.createElement('input');

    let saved = false;

    input.type = 'number';
    input.step = '0.01';
    input.min = '0';
    input.value = oldValue;
    input.className = 'income-value-input';

    span.replaceWith(input);
    input.focus();
    input.select();

    const save = () => {
        console.log("Saving income");
        if (saved) return;
        
        saved = true;

        const newValue = parseFloat(input.value || 0).toFixed(2);

        span.textContent = formatIncome(newValue);
        input.replaceWith(span);

        upsertIncome(newValue, span.dataset.name);
    };

    const cancel = () => {

        console.log("Canceled update");
        input.replaceWith(span);
    };

    input.addEventListener('blur', cancel);

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') save();
        if (e.key === 'Escape') cancel();
    });
}

function formatIncome(v){

    if(v != null){
        return Number(v).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
    }

    return '';
}

async function loadIncome() {

    console.log("In loadIncome - currentYear: "+currentYear+" currentMonth: "+currentMonth);

    const isCurrentMonth = currentYear === now.getFullYear() && currentMonth === now.getMonth() + 1;

    const incomeLuisElem = document.getElementById('incomeLuis');
    const incomeSaraElem = document.getElementById('incomeSara');

    try {
        const res = await fetch(
            `/api/budget/income?year=${currentYear}&month=${currentMonth}`,
            { headers: getAuthHeaders() }
        );
        if (!res.ok) return;
        const data = await res.json();

        console.log("loadIncome - data:",data);

        if(data.length){
            //There is data

            const luisEntry = data.find(r => r.user_name === 'Luis');
            const saraEntry = data.find(r => r.user_name === 'Sara');


            incomeLuisElem.textContent = formatIncome(luisEntry?.amount) ?? '';
            incomeSaraElem.textContent = formatIncome(saraEntry?.amount) ?? '';

            console.log("displaying incomes - with data");
        }else{
            //There is no data

            incomeLuisElem.textContent = formatIncome(0);
            incomeSaraElem.textContent = formatIncome(0);

            console.log("displaying incomes - with no data");
        }

        recalcIncome();
    } catch {
        // Silently fail — income section just stays empty
    }
}

function recalcIncome() {

    const luis = parseFloat(document.getElementById('incomeLuis').textContent) || 0;
    const sara = parseFloat(document.getElementById('incomeSara').textContent) || 0;
    totalIncome = luis + sara;

    console.log("recalcIncome - totalIncome:",totalIncome);
    updateSummary();
    // Update all slider maxes
    document.querySelectorAll('.budget-slider').forEach(s => {
        s.max = totalIncome > 0 ? totalIncome : 5000;
    });
}

//document.getElementById('incomeLuis').addEventListener('input', recalcIncome);
//document.getElementById('incomeSara').addEventListener('input', recalcIncome);


async function upsertIncome(incomeValue, userName) {

    console.log("upsertIncome");

    try {
        const res = await fetch('/api/budget/income', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                year: currentYear,
                month: currentMonth,
                entries: [
                    { user_name: userName, amount: incomeValue }
                ]
            })
        });

        if (!res.ok) throw new Error('Failed to update income');
        showToast('Income upserted');

    } catch (err) {
        showToast(err.message, 'error');
    }    

    recalcIncome();
}

// ── Budget ────────────────────────────────────────────────────────────────────

async function loadBudget() {
    try {
        const res = await fetch(
            `/api/budget/categories?year=${currentYear}&month=${currentMonth}`,
            { headers: getAuthHeaders() }
        );
        if (!res.ok) return;
        const data = await res.json();
        budgetValues = {};
        data.forEach(r => { budgetValues[r.category] = parseFloat(r.amount); });
    } catch {
        budgetValues = {};
    }
}

async function loadSpent() {
    try {
        // First day and last day of selected month
        const from = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
        const lastDay = new Date(currentYear, currentMonth, 0).getDate();
        const to = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const res = await fetch(`/api/expenses?from=${from}&to=${to}`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const expenses = await res.json();

        spentValues = {};
        expenses.forEach(e => {
            spentValues[e.category] = (spentValues[e.category] || 0) + parseFloat(e.amount);
        });
    } catch {
        spentValues = {};
    }
}

// ── Render budget list ────────────────────────────────────────────────────────

function renderBudgetRow(cat){
    const sliderMax = totalIncome > 0 ? totalIncome : 5000;

    const budget = budgetValues[cat] || 0;
    const spent = spentValues[cat] || 0;
    const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
    const over = spent > budget && budget > 0;
    const barColor = over ? 'var(--error)' : pct > 80 ? '#e8a838' : 'var(--success)';

    const config = CATEGORIES[cat];
    const ratioLabel = config && config.luis_share !== 0.5
        ? `<span class="share-label">L${Math.round(config.luis_share*100)}·S${Math.round(config.sara_share*100)}</span>`
        : '';

    return `
    <div class="budget-row" data-category="${escapeAttr(cat)}">
        <div class="budget-row-header">
            <div class="budget-category-name">${escapeHtml(cat)}${ratioLabel}</div>
            <div class="budget-amounts">
                <span class="${over ? 'over' : 'spent'}">€${spent.toFixed(2)}</span>
                <span style="color:var(--border)"> / </span>
                <span>€<span class="budget-display">${budget.toFixed(2)}</span></span>
            </div>
        </div>
        <div class="budget-progress-track">
            <div class="budget-progress-fill"
                    style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div class="budget-input-row">
            <input type="range" class="budget-slider"
                style="flex:1"
                min="0" max="${sliderMax}" step="10"
                value="${budget}"
                data-cat="${escapeAttr(cat)}" />
            <input type="number" class="budget-text-input"
                style="width:75px;flex:none"
                min="0" step="0.01" value="${budget || ''}"
                placeholder="0"
                data-cat="${escapeAttr(cat)}" inputmode="decimal" />
        </div>
    </div>`;
}


function renderBudgetList() {
    const list = document.getElementById('budgetList');

    // Use categories from localStorage, fall back to keys from existing budget
    /*const cats = CATEGORIES.length
        ? Object.keys(CATEGORIES)
        : Object.keys({ ...budgetValues, ...spentValues });*/
    const cats = Object.keys(CATEGORIES)

    if (!cats.length) {
        list.innerHTML = '<div class="empty-state"><div class="empty-icon">📂</div>No categories found. Add an expense first to populate categories.</div>';
        return;
    }

    // Split categories into two groups
    const sharedEqually = cats.filter(cat => {
        const c = CATEGORIES[cat];
        return !c || (c.luis_share === 0.5 && c.sara_share === 0.5);
    });

    const splitUnequally = cats.filter(cat => {
        const c = CATEGORIES[cat];
        return c && !(c.luis_share === 0.5 && c.sara_share === 0.5);
    });

    const renderGroup = (groupCats) => groupCats.map(cat => renderBudgetRow(cat)).join('');

    list.innerHTML =
        renderGroup(splitUnequally) +
        (sharedEqually.length ? `
            <div class="budget-group-divider">
                <span>Split expenses</span>
            </div>
            ${renderGroup(sharedEqually)}
        ` : '');

    // Wire up slider ↔ text field sync
    list.querySelectorAll('.budget-slider').forEach(slider => {
        const cat = slider.dataset.cat;
        const row = slider.closest('.budget-row');
        const textInput = row.querySelector('.budget-text-input');

        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value) || 0;
            textInput.value = val;
            updateBudgetRow(row, cat, val);
            markUnsaved();
        });
    });

    list.querySelectorAll('.budget-text-input').forEach(input => {
        const cat = input.dataset.cat;
        const row = input.closest('.budget-row');
        const slider = row.querySelector('.budget-slider');

        input.addEventListener('input', () => {
            const val = parseFloat(input.value) || 0;
            // Clamp slider (it has a max) but text field is unlimited
            slider.value = Math.min(val, parseFloat(slider.max));
            updateBudgetRow(row, cat, val);
            markUnsaved();
        });
    });

    updateBudgetTotals();
    document.getElementById('budgetTotals').style.display = 'flex';
}

function updateBudgetRow(row, cat, newBudget) {
    budgetValues[cat] = newBudget;
    const spent = spentValues[cat] || 0;
    const pct = newBudget > 0 ? Math.min((spent / newBudget) * 100, 100) : 0;
    const over = spent > newBudget && newBudget > 0;
    const barColor = over ? 'var(--error)' : pct > 80 ? '#e8a838' : 'var(--success)';

    row.querySelector('.budget-display').textContent = newBudget.toFixed(2);
    row.querySelector('.budget-progress-fill').style.width = `${pct}%`;
    row.querySelector('.budget-progress-fill').style.background = barColor;

    const spentEl = row.querySelector('.spent, .over');
    spentEl.className = over ? 'over' : 'spent';

    updateBudgetTotals();
    updateSummary();
}

function updateBudgetTotals() {
    const totalBudget = Object.values(budgetValues).reduce((s, v) => s + v, 0);
    const totalSpent = Object.values(spentValues).reduce((s, v) => s + v, 0);
    const remaining = totalBudget - totalSpent;

    document.getElementById('totalBudget').textContent = `€${totalBudget.toFixed(2)}`;
    document.getElementById('totalSpent').textContent = `€${totalSpent.toFixed(2)}`;
    const remEl = document.getElementById('totalRemaining');
    remEl.textContent = `€${Math.abs(remaining).toFixed(2)}${remaining < 0 ? ' over' : ''}`;
    remEl.className = `budget-totals-value ${remaining < 0 ? 'over' : 'ok'}`;
}

function updateSummary() {

    console.log("updateSummary - totalIncome: "+totalIncome);

    const totalBudgeted = Object.values(budgetValues).reduce((s, v) => s + v, 0);

    console.log("totalBudgeted: "+totalBudgeted);

    const remaining = totalIncome - totalBudgeted;

    document.getElementById('summaryIncome').textContent = `€${totalIncome.toFixed(2)}`;
    document.getElementById('summaryBudgeted').textContent = `€${totalBudgeted.toFixed(2)}`;

    const remEl = document.getElementById('summaryRemaining');
    remEl.textContent = `€${Math.abs(remaining).toFixed(2)}${remaining < 0 ? ' over' : ''}`;
    remEl.className = `income-summary-value ${remaining < 0 ? 'negative' : remaining > 0 ? 'positive' : 'neutral'}`;
}

function markUnsaved() {
    hasUnsavedBudget = true;
    document.getElementById('unsavedBadge').classList.add('visible');
}

// ── Save budget ───────────────────────────────────────────────────────────────

document.getElementById('saveBudgetBtn').addEventListener('click', async () => {
    const btn = document.getElementById('saveBudgetBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>Saving…';

    const entries = Object.entries(budgetValues).map(([category, amount]) => ({
        category, amount,
    }));

    try {
        const res = await fetch('/api/budget/categories', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ year: currentYear, month: currentMonth, entries }),
        });

        if (!res.ok) throw new Error('Failed to save budget');
        showToast('Budget saved');
        hasUnsavedBudget = false;
        document.getElementById('unsavedBadge').classList.remove('visible');
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Save Budget';
    }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;');
}
