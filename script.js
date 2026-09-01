/* ---------------- config / storage ---------------- */
const CFG_KEY = "ourbudget_config_v1";
const CACHE_KEY = "ourbudget_cache_v1";

// Bump this with every release, and add a matching entry to CHANGELOG below.
// Also bump the CACHE_NAME in sw.js to the same value so Safari's standalone
// app picks up the new files instead of serving a stale cached copy.
const APP_VERSION = "1.2.5";
const CHANGELOG = [
  { version: "1.2.5", notes: [
    "Added a month switcher (‹ / ›) at the top of the Dashboard — Balance, Personal Spending, Recent Activity, and both Budgets tabs now all show whichever month you've navigated to, with a 'Jump back to this month' shortcut",
    "Recent Activity is now scoped to the selected month (up to 20 entries) instead of always showing the latest few transactions regardless of month"
  ]},
  { version: "1.2.4", notes: [
    "Split the CSS and JS out of index.html into style.css and script.js — same app, no functional change, just easier to maintain",
    "Upload all three files (index.html, style.css, script.js) together, alongside manifest.json and sw.js"
  ]},
  { version: "1.2.3", notes: [
    "Receipt items paid from the Food Fund can now be tagged to a person instead of only 'Shared' — tagged items still come out of the fund immediately, but auto-log an IOU so that person owes the fund back",
    "The Food Fund's Contribute card now warns if the selected person still owes the fund from a past receipt, with a one-tap 'Settle & contribute' that pays it back and clears the IOU together"
  ]},
  { version: "1.2.2", notes: [
    "The 'actually for their share' IOU checkbox is now available for Personal expenses too, not just Household — so if you front a personal purchase for your partner, it creates the IOU and correctly counts against their personal spending, not yours",
    "Budgets > Personal now shows '· fronted by X' on any entry someone else actually paid for"
  ]},
  { version: "1.2.1", notes: [
    "Switched receipt scanning from gemini-2.0-flash (shut down by Google) to gemini-3.6-flash",
    "Added a 'Personal spending this month' card to the Dashboard, so each person's personal spending — and progress against their limit — is visible at a glance instead of only inside Budgets > Personal",
    "Fixed dropdowns (Who Paid, category, Food Fund, IOU from/to) silently reverting to their default option on background refresh, which could cause a Food Fund purchase to accidentally post as a regular household expense"
  ]},
  { version: "1.2.0", notes: [
    "Every action (add/delete transaction, budgets, goals, IOUs, Food Fund) now updates the screen instantly instead of waiting on the Sheet — the backend syncs quietly in the background",
    "If a background sync ever fails, only that one change is reverted, with a toast explaining why — everything else you did stays put",
    "Auto-refresh and pull-to-refresh no longer risk overwriting something you just did while a sync was still in flight",
    "No functional change to what gets saved — this only changes how fast it feels"
  ]},
  { version: "1.1.4", notes: [
    "Food Fund is now a 'Who paid' option when scanning a receipt — pick it and the whole receipt is deducted from the fund, no payer/split tagging needed"
  ]},
  { version: "1.1.3", notes: [
    "Fixed Food Fund accounting: contributing now counts against your income (money left your pocket into the pot); spending from the fund no longer counts against income a second time, though it still shows up in category budgets",
    "Fund-drawn transactions are now tagged '· from food fund' in the activity feed",
    "Requires the matching Code.gs v1.0.3 update — see that file's changelog"
  ]},
  { version: "1.1.2", notes: [
    "Income entries no longer show the Category field (income is always logged as 'Income') or the 'actually for their share' checkbox, which only applies to expenses",
    "'Paid by' now reads 'Received by' when logging income"
  ]},
  { version: "1.1.1", notes: [
    "Fixed: tapping Income on the Add screen did nothing visually — it now highlights and switches the form correctly",
    "Fixed: Scan receipt jumped straight to the camera — it now shows the full picker (camera, photo library, or browse for a PDF)"
  ]},
  { version: "1.1.0", notes: [
    "Full visual redesign — new indigo/purple theme, gradient header, colored category icon badges, and a spending-breakdown donut chart on the Budgets tab",
    "New app icon and updated status bar / theme colors to match",
    "No functional or data changes — everything works exactly as before, just restyled"
  ]},
  { version: "1.0.4", notes: [
    "Add and remove category budgets right from the Budgets tab",
    "Personal spending tracking — log a purchase as Household or Personal; personal spending is kept separate from the household category budgets and has its own optional monthly limit per person",
    "In-app version number and changelog (this screen)",
    "Safari standalone polish: smoother touch handling, no bounce/zoom quirks, and a one-time reminder to Add to Home Screen"
  ]},
  { version: "1.0.3", notes: [
    "Auto-refresh every 30 seconds while the app is open, and instantly when returning to it",
    "Pull-to-refresh gesture on any screen",
    "Food Fund available as a 'Paid by' option when logging a transaction, deducting straight from the fund"
  ]},
  { version: "1.0.2", notes: [
    "AI receipt scanning — snap a photo or PDF and let Gemini itemize it, then tag each item Payer / Other partner / Shared"
  ]},
  { version: "1.0.1", notes: [
    "Food Fund: a shared, ring-fenced pot for groceries and food spending",
    "IOUs / Debts tracking between partners, with manual and auto-created entries"
  ]},
  { version: "1.0.0", notes: [
    "Initial release: shared income & expense tracking, category budgets, savings goals, dashboard, and settings"
  ]}
];

// Pre-filled so the app works immediately without visiting Settings.
// Anything saved in Settings later (e.g. a changed passcode) overrides these.
const DEFAULT_CONFIG = {
  apiUrl: "https://script.google.com/macros/s/AKfycbxFREWx42-rLloMJApIVOEv0zlI5wz1VNcpYyaTJ0oaA9pqROt45wH9kAQ7PRq1MYX0/exec",
  passcode: "022398",
  geminiKey: ""
};

function getConfig(){
  let stored = {};
  try{ stored = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }catch(e){ stored = {}; }
  return { ...DEFAULT_CONFIG, ...stored };
}
function setConfig(c){ localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
function getCache(){ try{ return JSON.parse(localStorage.getItem(CACHE_KEY)) || null; }catch(e){ return null; } }
function setCache(d){ localStorage.setItem(CACHE_KEY, JSON.stringify(d)); }

const EMPTY_STATE = { transactions: [], categories: [], goals: [], settings: {}, foodFund: {balance:0, entries:[]}, debts: [] };
// CONFIRMED holds the last state we know the backend actually has (from a full
// getAll fetch, or patched in directly the moment a mutation is confirmed).
// STATE is what's rendered: CONFIRMED with every still-pending optimistic
// change re-applied on top, recomputed fresh on every change so a slow/stale
// backend response can never stomp a newer local action.
let CONFIRMED = JSON.parse(JSON.stringify(EMPTY_STATE));
let STATE = CONFIRMED;
let pendingOps = [];      // [{id, patch(state)->state}], applied in order on top of CONFIRMED
let opSeq = 0;
let confirmedLoadedOnce = false;
const pendingCreateOpByTmpId = {}; // tmp entity id -> pending op id, so a delete before confirm can just cancel it
let scannedItems = []; // items pending review from a receipt scan
const FOOD_FUND_LABEL = "Food Fund";

/* ---------------- optimistic sync engine ---------------- */
function cloneState(s){ return JSON.parse(JSON.stringify(s)); }
function genId(){ return 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2,8); }

function recompute(){
  let s = cloneState(CONFIRMED);
  for(const op of pendingOps){ s = op.patch(s); }
  STATE = s;
  render();
}

// Immediately applies `patch` to the rendered state (optimistic), fires
// `apiCall` in the background, and on success folds the (authoritative)
// result into CONFIRMED; on failure, un-applies just this one operation.
// Returns the operation id so callers can cancel it (e.g. the user deletes
// something before its own creation has been confirmed).
function runOptimistic({ patch, apiCall, onSuccess, label }){
  const id = 'op' + (++opSeq);
  pendingOps.push({ id, patch });
  recompute();
  (async () => {
    try{
      const result = await apiCall();
      pendingOps = pendingOps.filter(o => o.id !== id);
      const confirmPatch = onSuccess ? (s) => onSuccess(s, result) : patch;
      CONFIRMED = confirmPatch(cloneState(CONFIRMED));
      recompute();
    }catch(err){
      pendingOps = pendingOps.filter(o => o.id !== id);
      recompute();
      showToast(err.message || (label ? label + ' failed — reverted' : 'That failed — reverted'));
    }
  })();
  return id;
}

function cancelPendingOp(opId){
  pendingOps = pendingOps.filter(o => o.id !== opId);
  recompute();
}

// Generic list-patch helpers. Entities are matched by `id` unless a custom
// matchFn is given (categories only have a `name`, no `id`).
function addToList(key, obj){ return (s) => { s[key] = [...(s[key]||[]), obj]; return s; }; }
function removeFromList(key, id){ return (s) => { s[key] = (s[key]||[]).filter(x => x.id !== id); return s; }; }
function updateInList(key, id, updates){ return (s) => { s[key] = (s[key]||[]).map(x => x.id === id ? {...x, ...updates} : x); return s; }; }
function removeFromListBy(key, matchFn){ return (s) => { s[key] = (s[key]||[]).filter(x => !matchFn(x)); return s; }; }
function updateInListBy(key, matchFn, updates){ return (s) => { s[key] = (s[key]||[]).map(x => matchFn(x) ? {...x, ...updates} : x); return s; }; }

// Delete helper shared by every "×" button: if the row being deleted is still
// an unconfirmed local creation (tmp_ id), just cancel that pending create —
// there's nothing on the backend yet to send a delete for.
function optimisticDelete(key, id, action, label){
  if(pendingCreateOpByTmpId[id]){
    cancelPendingOp(pendingCreateOpByTmpId[id]);
    delete pendingCreateOpByTmpId[id];
    return;
  }
  runOptimistic({ patch: removeFromList(key, id), apiCall: () => apiPost(action, {id}), label });
}

/* ---------------- API ---------------- */
async function apiGet(action){
  const cfg = getConfig();
  if(!cfg.apiUrl) throw new Error("Not connected yet — go to Settings.");
  const url = `${cfg.apiUrl}?action=${action}&passcode=${encodeURIComponent(cfg.passcode||"")}`;
  const res = await fetch(url);
  const json = await res.json();
  if(!json.ok) throw new Error(json.error || "Request failed");
  return json.data;
}
async function apiPost(action, payload){
  const cfg = getConfig();
  if(!cfg.apiUrl) throw new Error("Not connected yet — go to Settings.");
  const res = await fetch(cfg.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload, passcode: cfg.passcode||"" })
  });
  const json = await res.json();
  if(!json.ok) throw new Error(json.error || "Request failed");
  return json.data;
}

// Refreshes CONFIRMED from the Sheet and recomputes. Because recompute()
// re-applies any operations that are still pending on top of whatever comes
// back here, a slow getAll response can never overwrite a newer optimistic
// change the user made while it was in flight.
async function loadAll(showToastOnFail, showSuccessToast){
  try{
    const data = await apiGet("getAll");
    CONFIRMED = data;
    confirmedLoadedOnce = true;
    setCache(data);
    recompute();
    if(showSuccessToast) showToast('Refreshed ✓');
  }catch(err){
    if(!confirmedLoadedOnce){
      const cached = getCache();
      if(cached){ CONFIRMED = cached; confirmedLoadedOnce = true; recompute(); }
      if(showToastOnFail !== false) showToast(cached ? "Offline — showing last saved data" : err.message);
    } else if(showToastOnFail !== false){
      // We already have good local state (plus any pending edits) — don't
      // discard it over a single flaky background refresh, just report it.
      showToast("Offline — showing local data");
    }
  }
}

// Builds the plain objects for a transaction (+ its optional auto-created IOU
// and/or Food Fund ledger entry) exactly as Code.gs's addTransaction_ would,
// so the optimistic version on screen matches what the Sheet ends up with.
function makeTxObjects(payload, txId, debtId, fundEntryId){
  const nowIso = new Date().toISOString();
  const isFundPay = payload.type === 'expense' && payload.paidBy === FOOD_FUND_LABEL;
  const scope = isFundPay ? 'fund' : (payload.scope || 'shared');
  const tx = { id: txId, date: payload.date, type: payload.type, amount: Number(payload.amount), category: payload.category||'', paidBy: payload.paidBy||'', note: payload.note||'', createdAt: nowIso, scope };
  const debt = (payload.actuallyFor && payload.paidBy && payload.actuallyFor !== payload.paidBy)
    ? { id: debtId, fromWho: payload.actuallyFor, toWho: payload.paidBy, amount: Number(payload.amount), reason: payload.category || payload.note || 'Shared expense', date: payload.date, status: 'open', createdAt: nowIso, settledAt: '', linkedTransactionId: txId }
    : null;
  const fundEntry = isFundPay
    ? { id: fundEntryId, type: 'spend', amount: Number(payload.amount), by: FOOD_FUND_LABEL, note: payload.note||'', date: payload.date, createdAt: nowIso, linkedTransactionId: txId }
    : null;
  return { tx, debt, fundEntry };
}

// Shared optimistic path for every "add a transaction" flow (the Add screen
// and each line of a saved receipt): show it immediately, sync in the
// background, and swap in the server's real id(s) once confirmed.
function optimisticAddTransaction(payload, label){
  const txId = genId();
  const debtId = payload.actuallyFor ? genId() : null;
  const fundEntryId = (payload.type === 'expense' && payload.paidBy === FOOD_FUND_LABEL) ? genId() : null;
  const built = makeTxObjects(payload, txId, debtId, fundEntryId);

  const applyObjects = (s, b) => {
    s.transactions = [...(s.transactions||[]), b.tx];
    if(b.debt) s.debts = [...(s.debts||[]), b.debt];
    if(b.fundEntry){
      const fund = s.foodFund || {balance:0, entries:[]};
      s.foodFund = { balance: fund.balance - Number(payload.amount), entries: [...(fund.entries||[]), b.fundEntry] };
    }
    return s;
  };

  const opId = runOptimistic({
    patch: (s) => applyObjects(s, built),
    apiCall: () => apiPost('addTransaction', payload),
    onSuccess: (s, result) => applyObjects(s, makeTxObjects(payload, result.id, result.debtId, fundEntryId ? 'fund_'+result.id : null)),
    label: label || 'Save transaction'
  });
  pendingCreateOpByTmpId[txId] = opId;
  return txId;
}

/* ---------------- helpers ---------------- */
function fmt(n){ const v = Number(n||0); return v.toLocaleString('en-AE', {minimumFractionDigits:0, maximumFractionDigits:0}); }
function currentMonthKey(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
function showToast(msg){ const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2600); }
function names(){ const s = STATE.settings||{}; return { p1: s.partner1Name||"Partner 1", p2: s.partner2Name||"Partner 2" }; }

// Which month the Dashboard/Budgets/Personal screens are currently showing.
// Defaults to the current month; the ‹ › controls on the Dashboard move it.
let selectedMonthKey = currentMonthKey();
function monthKeyToDate(key){ const [y,m] = key.split('-').map(Number); return new Date(y, m-1, 1); }
function shiftMonthKey(key, delta){
  const d = monthKeyToDate(key);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function monthKeyLabel(key){
  return monthKeyToDate(key).toLocaleDateString('en-GB', { month:'long', year:'numeric' });
}

// Maps a category name to an icon + color for the icon badges used throughout the app.
// Unrecognized/custom category names fall back to a generic badge with their initial.
const CATEGORY_STYLE = {
  "Groceries":   { icon: "🛒", color: "#5B67CA" },
  "Dining Out":  { icon: "🍽️", color: "#FF9F43" },
  "Transport":   { icon: "🚗", color: "#FF6B6B" },
  "Rent":        { icon: "🏠", color: "#4834D4" },
  "Utilities":   { icon: "💡", color: "#F5A623" },
  "Entertainment": { icon: "🎬", color: "#A55EEA" },
  "Shopping":    { icon: "🛍️", color: "#26DE81" },
  "Health":      { icon: "💊", color: "#FC5C65" },
  "Other":       { icon: "✨", color: "#8E88AC" },
  "Income":      { icon: "💰", color: "#20BF6B" },
  "Food Fund":   { icon: "🍱", color: "#F5A623" }
};
function categoryStyle(name){
  return CATEGORY_STYLE[name] || { icon: (name||"?").trim().charAt(0).toUpperCase() || "?", color: "#6C5CE7" };
}

function scopeOf(t){ return t.scope || 'shared'; } // legacy rows without a scope column count as shared

/* ---------------- render ---------------- */
function render(){
  const settings = STATE.settings || {};
  const { p1, p2 } = names();
  const currency = settings.currency || "AED";

  document.getElementById('dateLabel').textContent = new Date().toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});

  // month switcher — never let it go past the current month
  const isCurrentMonth = selectedMonthKey === currentMonthKey();
  document.getElementById('monthSwitchLabel').textContent = monthKeyLabel(selectedMonthKey);
  document.getElementById('monthNextBtn').disabled = isCurrentMonth;
  document.getElementById('monthTodayBtn').style.display = isCurrentMonth ? 'none' : 'block';
  document.getElementById('topMonthLabel').textContent = isCurrentMonth ? 'This month' : monthKeyLabel(selectedMonthKey);
  document.getElementById('balanceCardTitle').textContent = isCurrentMonth ? 'Balance this month' : `Balance — ${monthKeyLabel(selectedMonthKey)}`;
  document.getElementById('personalSummaryTitle').textContent = isCurrentMonth ? 'Personal spending this month' : `Personal spending — ${monthKeyLabel(selectedMonthKey)}`;
  document.getElementById('recentTxTitle').textContent = isCurrentMonth ? 'Recent activity' : `Activity — ${monthKeyLabel(selectedMonthKey)}`;
  document.getElementById('dashBalanceSub').textContent = isCurrentMonth ? 'Income minus expenses, month to date' : `Income minus expenses for ${monthKeyLabel(selectedMonthKey)}`;
  document.getElementById('budgetsMonthNote').textContent = isCurrentMonth ? 'Showing this month' : `Showing ${monthKeyLabel(selectedMonthKey)}`;

  const monthTx = (STATE.transactions||[]).filter(t => (t.date||"").slice(0,7) === selectedMonthKey);
  const income = monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount),0);
  const expense = monthTx.filter(t=>t.type==='expense' && scopeOf(t)!=='fund').reduce((s,t)=>s+Number(t.amount),0);
  const net = income - expense;

  document.getElementById('monthNetLabel').textContent = `${net>=0?'':'-'}${currency} ${fmt(Math.abs(net))}`;
  document.getElementById('dashBalance').textContent = `${currency} ${fmt(net)}`;

  const p1Paid = monthTx.filter(t=>t.type==='expense' && t.paidBy===p1 && scopeOf(t)!=='personal' && scopeOf(t)!=='fund').reduce((s,t)=>s+Number(t.amount),0);
  const p2Paid = monthTx.filter(t=>t.type==='expense' && t.paidBy===p2 && scopeOf(t)!=='personal' && scopeOf(t)!=='fund').reduce((s,t)=>s+Number(t.amount),0);
  const totalPaid = p1Paid + p2Paid || 1;
  const p1pct = (p1Paid/totalPaid)*100;
  document.getElementById('whoThread').innerHTML =
    `<div class="seg p1" style="left:0;width:${p1pct}%"></div><div class="seg p2" style="left:${p1pct}%;width:${100-p1pct}%"></div>`;
  document.getElementById('p1Label').textContent = `${p1} · ${currency} ${fmt(p1Paid)}`;
  document.getElementById('p2Label').textContent = `${p2} · ${currency} ${fmt(p2Paid)}`;

  // food fund on dashboard
  document.getElementById('dashFundBalance').textContent = `${currency} ${fmt((STATE.foodFund||{}).balance)}`;

  // personal spending on dashboard — an at-a-glance version of the fuller
  // Budgets > Personal tab, so you don't have to dig in just to see whether
  // anything's actually been deducted from either person individually.
  document.getElementById('dashPersonalSummary').innerHTML = [
    { key: 'P1', name: p1 }, { key: 'P2', name: p2 }
  ].map(p => {
    const { spent, limit, pct, over } = personalSpendFor(p, monthTx, settings, debtsByTxId());
    return `<div style="margin-bottom:10px">
      <div class="row"><span style="font-weight:600">${p.name}</span><span class="mono" style="font-size:13px;color:${over?'var(--danger)':'var(--paper-dim)'}">${currency} ${fmt(spent)}${limit>0 ? ' / '+fmt(limit) : ''}</span></div>
      ${limit>0 ? `<div class="thread" style="margin:6px 0 0"><div class="seg ${over?'over':'p2'}" style="left:0;width:${pct}%"></div></div>` : `<div class="balance-sub" style="margin-top:2px;font-size:12px">No personal limit set</div>`}
    </div>`;
  }).join('');

  // debt summary on dashboard
  renderDebtSummary(currency, p1, p2, document.getElementById('dashDebtSummary'));

  // budget overview
  const byCat = {};
  monthTx.filter(t=>t.type==='expense' && scopeOf(t)!=='personal').forEach(t=>{ byCat[t.category] = (byCat[t.category]||0) + Number(t.amount); });
  const cats = (STATE.categories||[]).slice().sort((a,b)=> (byCat[b.name]||0) - (byCat[a.name]||0)).slice(0,4);
  document.getElementById('budgetOverview').innerHTML = cats.length ? cats.map(c=>{
    const spent = byCat[c.name]||0;
    const budget = Number(c.monthlyBudget)||0;
    const pct = budget>0 ? Math.min(100,(spent/budget)*100) : 0;
    const over = budget>0 && spent>budget;
    const cs = categoryStyle(c.name);
    return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
      <span class="cat-icon-sm" style="background:${cs.color}">${cs.icon}</span>
      <div style="flex:1;min-width:0">
        <div class="row"><span>${c.name}</span><span class="mono" style="color:${over?'var(--danger)':'var(--paper-dim)'}">${currency} ${fmt(spent)} / ${fmt(budget)}</span></div>
        <div class="thread"><div class="seg ${over?'over':'p2'}" style="left:0;width:${pct}%;background:${over?'var(--danger)':cs.color}"></div></div>
      </div>
    </div>`;
  }).join('') : `<div class="empty">Set category budgets in the Budgets tab.</div>`;

  // recent transactions — scoped to whichever month is selected above
  const recent = monthTx.slice().sort((a,b)=> new Date(b.date)-new Date(a.date) || new Date(b.createdAt)-new Date(a.createdAt)).slice(0,20);
  document.getElementById('recentTx').innerHTML = recent.length ? recent.map(t=>{
    const dotColor = t.paidBy===p1 ? 'var(--coral)' : t.paidBy===p2 ? 'var(--blue)' : t.paidBy===FOOD_FUND_LABEL ? 'var(--gold)' : 'var(--seafoam)';
    const sign = t.type==='income' ? '+' : '−';
    const isPersonal = scopeOf(t) === 'personal';
    const isFund = scopeOf(t) === 'fund';
    const catName = t.category || (t.type==='income'?'Income':'Expense');
    const cs = categoryStyle(catName);
    return `<div class="tx">
      <div class="tx-left">
        <span class="cat-icon-sm" style="background:${cs.color}">${cs.icon}</span>
        <div>
          <div class="name">${catName}${isPersonal ? ' <span class="mono" style="font-size:10px;color:var(--gold)">· personal</span>' : ''}${isFund ? ' <span class="mono" style="font-size:10px;color:var(--gold)">· from food fund</span>' : ''}</div>
          <div class="meta"><span class="who" style="background:${dotColor}"></span>${t.date} · ${t.paidBy||''}${t.note ? ' · '+t.note : ''}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <div class="amt mono ${t.type}">${sign}${currency} ${fmt(t.amount)}</div>
        <button class="tx-del" data-id="${t.id}" title="Delete">✕</button>
      </div>
    </div>`;
  }).join('') : `<div class="empty">${isCurrentMonth ? 'No transactions yet — add your first one below.' : 'No transactions in '+monthKeyLabel(selectedMonthKey)+'.'}</div>`;

  // budgets screen — spending breakdown donut
  renderSpendingDonut(byCat, currency);

  // budgets screen — category rows with icon + progress bar
  document.getElementById('budgetList').innerHTML = (STATE.categories||[]).map(c=>{
    const spent = byCat[c.name]||0;
    const budget = Number(c.monthlyBudget)||0;
    const pct = budget>0 ? Math.min(100,(spent/budget)*100) : 0;
    const over = budget>0 && spent>budget;
    const cs = categoryStyle(c.name);
    return `<div style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span class="cat-icon-sm" style="background:${cs.color}">${cs.icon}</span>
        <div style="flex:1;font-weight:600">${c.name}</div>
        <span class="mono" style="font-size:12px;color:${over?'var(--danger)':'var(--paper-dim)'}">${currency} ${fmt(spent)} / ${fmt(budget)}</span>
      </div>
      <div class="thread"><div class="seg ${over?'over':''}" style="left:0;width:${pct}%;background:${over?'var(--danger)':cs.color}"></div></div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <input type="number" class="budget-input" data-cat="${c.name}" value="${c.monthlyBudget}" inputmode="decimal">
        <button class="ghost budget-save" data-cat="${c.name}" style="width:auto;padding:0 16px;margin-top:0">Save</button>
        <button class="ghost budget-del" data-cat="${c.name}" style="width:auto;padding:0 12px;margin-top:0;color:var(--danger)">✕</button>
      </div>
    </div>`;
  }).join('') || `<div class="empty">No categories yet.</div>`;

  // personal spending screen
  renderPersonalBudgets(monthTx, currency, p1, p2, settings);

  // savings screen
  document.getElementById('goalsList').innerHTML = (STATE.goals||[]).map(g=>{
    const pct = g.targetAmount>0 ? Math.min(100,(g.currentAmount/g.targetAmount)*100) : 0;
    return `<div class="card goal-card">
      <div class="row"><h3 style="margin:0">${g.name}</h3><span class="mono">${Math.round(pct)}%</span></div>
      <div class="goal-thread"><div class="fill" style="width:${pct}%"></div></div>
      <div class="row" style="margin-top:8px">
        <span class="meta" style="color:var(--paper-dim);font-size:12px">${currency} ${fmt(g.currentAmount)} of ${fmt(g.targetAmount)}${g.deadline ? ' · by '+g.deadline : ''}</span>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <input type="number" placeholder="Add amount" class="goal-add-input" data-id="${g.id}" inputmode="decimal" style="flex:1">
        <button class="ghost goal-add-btn" data-id="${g.id}" style="width:auto;padding:0 16px;margin-top:0">Add</button>
        <button class="ghost goal-del-btn" data-id="${g.id}" style="width:auto;padding:0 14px;margin-top:0;color:var(--danger)">✕</button>
      </div>
    </div>`;
  }).join('') || `<div class="empty">No savings goals yet — create one above.</div>`;

  // Food Fund screen
  document.getElementById('fundBalanceBig').textContent = `${currency} ${fmt((STATE.foodFund||{}).balance)}`;
  const fundEntries = ((STATE.foodFund||{}).entries||[]).slice().sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt)).slice(0,15);
  document.getElementById('fundHistory').innerHTML = fundEntries.length ? fundEntries.map(e=>`
    <div class="fund-entry">
      <span>${e.type==='contribution'?'+ Contribution':'− Spend'} · ${e.by}${e.note ? ' · '+e.note : ''}</span>
      <span class="mono ${e.type==='contribution'?'plus':'minus'}">${currency} ${fmt(e.amount)}</span>
    </div>
  `).join('') : `<div class="empty">No activity yet.</div>`;

  // Debts screen
  renderDebtSummary(currency, p1, p2, document.getElementById('debtNetBig'), true);
  const openDebts = (STATE.debts||[]).filter(d=>d.status==='open').sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  document.getElementById('debtsList').innerHTML = openDebts.length ? openDebts.map(d=>`
    <div class="debt-item">
      <div>
        <div class="who">${d.fromWho} owes ${d.toWho}</div>
        <div class="meta">${d.reason || ''}${d.date ? ' · '+d.date : ''}</div>
        <div class="debt-actions">
          <button class="pill-btn settle" data-id="${d.id}" data-act="settle">Settle up</button>
          <button class="pill-btn" data-id="${d.id}" data-act="delete">Remove</button>
        </div>
      </div>
      <div class="amt mono">${currency} ${fmt(d.amount)}</div>
    </div>
  `).join('') : `<div class="empty">No open IOUs.</div>`;

  const settledDebts = (STATE.debts||[]).filter(d=>d.status==='settled').sort((a,b)=> new Date(b.settledAt)-new Date(a.settledAt)).slice(0,10);
  document.getElementById('settledDebtsList').innerHTML = settledDebts.length ? settledDebts.map(d=>`
    <div class="debt-item" style="opacity:.55">
      <div><div class="who">${d.fromWho} owed ${d.toWho}</div><div class="meta">Settled${d.settledAt ? ' · '+d.settledAt.slice(0,10) : ''}</div></div>
      <div class="amt mono">${currency} ${fmt(d.amount)}</div>
    </div>
  `).join('') : `<div class="empty">No settled IOUs yet.</div>`;

  // form selects everywhere — rebuilding a <select>'s options wipes out the
  // user's current pick unless we explicitly restore it, and render() now
  // runs far more often (every optimistic action, every background sync),
  // so this has to be preserved every time or a selection silently reverts.
  fillSelect('fCategory', (STATE.categories||[]).map(c=>c.name));
  fillSelect('scanCategory', (STATE.categories||[]).map(c=>c.name), 'Groceries');

  updatePaidByOptions();
  updateScopeHint();

  fillSelect('scanPaidBy', [p1, p2, FOOD_FUND_LABEL]);
  fillSelect('fundContribBy', [p1, p2]);
  updateFundContribWarning();
  fillSelect('fundSpendBy', [p1, p2]);
  fillSelect('debtFrom', [p1, p2]);
  fillSelect('debtTo', [p1, p2]);

  if(!document.activeElement || document.activeElement.id !== 'sP1Name') document.getElementById('sP1Name').value = p1;
  if(!document.activeElement || document.activeElement.id !== 'sP2Name') document.getElementById('sP2Name').value = p2;
}

// Rebuilds a <select>'s options while keeping whatever the user had chosen,
// if it's still a valid option. Falls back to defaultValue, then the first
// option, only when there's nothing worth preserving.
function fillSelect(id, options, defaultValue){
  const sel = document.getElementById(id);
  const prev = sel.value;
  sel.innerHTML = options.map(n=>`<option value="${n}">${n}</option>`).join('');
  if(options.includes(prev)) sel.value = prev;
  else if(defaultValue && options.includes(defaultValue)) sel.value = defaultValue;
}

function renderSpendingDonut(byCat, currency){
  const wrap = document.getElementById('spendingDonutWrap');
  const entries = Object.entries(byCat).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  const total = entries.reduce((s,[,v])=>s+v,0);
  if(!entries.length || total<=0){
    wrap.innerHTML = `<div class="empty" style="padding:10px 0">No shared spending logged yet this month.</div>`;
    return;
  }
  let cursor = 0;
  const stops = entries.map(([name, amt])=>{
    const pct = (amt/total)*100;
    const color = categoryStyle(name).color;
    const stop = `${color} ${cursor}% ${cursor+pct}%`;
    cursor += pct;
    return stop;
  });
  const gradient = `conic-gradient(${stops.join(',')})`;
  const legend = entries.slice(0,6).map(([name, amt])=>{
    const cs = categoryStyle(name);
    const pct = Math.round((amt/total)*100);
    return `<div class="legend-row">
      <span class="dot" style="background:${cs.color}"></span>
      <span class="lname">${name}</span>
      <span class="mono">${pct}%</span>
    </div>`;
  }).join('');
  wrap.innerHTML = `
    <div class="donut" style="background:${gradient}">
      <div class="donut-hole">
        <div class="donut-total">${currency} ${fmt(total)}</div>
        <div class="donut-label">This month</div>
      </div>
    </div>
    <div class="legend">${legend}</div>
  `;
}

// A personal transaction's owner is normally whoever paid — but if it was
// logged with "actually for their personal spending" checked, an IOU debt
// was created for it, and that's who the spend should really count against,
// not whoever fronted the money.
function debtsByTxId(){
  const map = {};
  (STATE.debts||[]).forEach(d => { if(d.linkedTransactionId) map[d.linkedTransactionId] = d; });
  return map;
}
function personalOwnerOf(t, debtMap){
  const linked = debtMap[t.id];
  return linked ? linked.fromWho : t.paidBy;
}

// Shared by the dashboard summary and the Budgets > Personal tab, so both
// always agree on exactly how much of a person's spending has been deducted.
function personalSpendFor(person, monthTx, settings, debtMap){
  const spent = monthTx.filter(t=>t.type==='expense' && scopeOf(t)==='personal' && personalOwnerOf(t, debtMap)===person.name).reduce((s,t)=>s+Number(t.amount),0);
  const limit = Number(settings['personalBudget'+person.key] || 0);
  const pct = limit>0 ? Math.min(100, (spent/limit)*100) : 0;
  const over = limit>0 && spent>limit;
  return { spent, limit, pct, over };
}

function renderPersonalBudgets(monthTx, currency, p1, p2, settings){
  const people = [
    { key: 'P1', name: p1 },
    { key: 'P2', name: p2 }
  ];
  const debtMap = debtsByTxId();
  document.getElementById('personalBudgetCards').innerHTML = people.map(p=>{
    const personalTx = monthTx.filter(t=>t.type==='expense' && scopeOf(t)==='personal' && personalOwnerOf(t, debtMap)===p.name)
      .sort((a,b)=> new Date(b.date)-new Date(a.date) || new Date(b.createdAt)-new Date(a.createdAt));
    const { spent, limit, pct, over } = personalSpendFor(p, monthTx, settings, debtMap);
    return `<div class="card">
      <h3>${p.name}'s personal spending</h3>
      <div class="balance-big mono" style="font-size:26px">${currency} ${fmt(spent)}</div>
      <div class="balance-sub">${limit>0 ? `of ${currency} ${fmt(limit)} monthly personal budget` : 'No personal budget limit set'}</div>
      ${limit>0 ? `<div class="thread"><div class="seg ${over?'over':'p2'}" style="left:0;width:${pct}%"></div></div>` : ''}
      <div style="display:flex;gap:8px;margin-top:16px">
        <input type="number" class="personal-limit-input" data-key="${p.key}" placeholder="Set monthly limit" value="${limit||''}" inputmode="decimal" style="flex:1">
        <button class="ghost personal-limit-save" data-key="${p.key}" style="width:auto;padding:0 16px;margin-top:0">Save</button>
      </div>
      <div style="margin-top:16px">
        ${personalTx.length ? personalTx.slice(0,8).map(t=>{
          const cs = categoryStyle(t.category || 'Personal');
          const frontedBy = t.paidBy !== p.name ? ` · fronted by ${t.paidBy}` : '';
          return `<div class="tx">
            <div class="tx-left">
              <span class="cat-icon-sm" style="background:${cs.color}">${cs.icon}</span>
              <div>
                <div class="name">${t.category || 'Personal'}</div>
                <div class="meta">${t.date}${t.note ? ' · '+t.note : ''}${frontedBy}</div>
              </div>
            </div>
            <div class="amt mono expense">−${currency} ${fmt(t.amount)}</div>
          </div>`;
        }).join('') : `<div class="empty">No personal spending logged this month.</div>`}
      </div>
    </div>`;
  }).join('');
}

function renderDebtSummary(currency, p1, p2, el, big){
  const open = (STATE.debts||[]).filter(d=>d.status==='open');
  let net = 0; // positive => p2 owes p1 net; negative => p1 owes p2 net
  open.forEach(d=>{
    if(d.toWho===p1) net += Number(d.amount);
    if(d.toWho===p2) net -= Number(d.amount);
  });
  if(Math.abs(net) < 0.01){ el.textContent = "All settled up"; return; }
  const text = net > 0 ? `${p2} owes ${p1} ${currency} ${fmt(net)}` : `${p1} owes ${p2} ${currency} ${fmt(Math.abs(net))}`;
  el.textContent = text;
}

function updateActuallyForRow(){
  const { p1, p2 } = names();
  const paidBy = document.getElementById('fPaidBy').value;
  const row = document.getElementById('actuallyForRow');
  const label = document.getElementById('actuallyForLabel');
  if(currentType === 'income'){ row.style.display='none'; document.getElementById('fActuallyFor').checked = false; return; }
  const other = paidBy === p1 ? p2 : paidBy === p2 ? p1 : null;
  if(!other){ row.style.display='none'; document.getElementById('fActuallyFor').checked = false; return; }
  row.style.display = 'flex';
  label.textContent = currentScope === 'personal'
    ? `This was actually ${other}'s personal spending — they'll owe ${paidBy} back`
    : `This was actually for ${other}'s share`;
}

// Personal transactions are always paid by one of the two people, and never
// through "Shared" or the Food Fund — those only make sense for household spending.
function updatePaidByOptions(){
  const { p1, p2 } = names();
  const sel = document.getElementById('fPaidBy');
  const prev = sel.value;
  const opts = currentScope === 'personal' ? [p1, p2] : [p1, p2, 'Shared', FOOD_FUND_LABEL];
  sel.innerHTML = opts.map(n=>`<option value="${n}">${n}</option>`).join('');
  if(opts.includes(prev)) sel.value = prev;
  updateActuallyForRow();
  updateFundHint();
}

function updateScopeHint(){
  const hint = document.getElementById('scopeHint');
  hint.textContent = currentScope === 'personal'
    ? "Personal spending — tracked separately and doesn't count against household category budgets."
    : "Counts toward your household category budgets.";
}

function updateFundHint(){
  const paidBy = document.getElementById('fPaidBy').value;
  const hint = document.getElementById('fundHint');
  const currency = (STATE.settings||{}).currency || 'AED';
  const balance = (STATE.foodFund||{}).balance || 0;
  const amount = Number(document.getElementById('fAmount').value || 0);
  if(paidBy === FOOD_FUND_LABEL){
    hint.style.display = 'block';
    const over = amount > balance;
    hint.style.color = over ? 'var(--danger)' : 'var(--paper-dim)';
    hint.textContent = over
      ? `Fund only has ${currency} ${fmt(balance)} — this will take it negative`
      : `Food Fund balance: ${currency} ${fmt(balance)}`;
  } else {
    hint.style.display = 'none';
  }
}

/* ---------------- month navigation ---------------- */
document.getElementById('monthPrevBtn').addEventListener('click', ()=>{
  selectedMonthKey = shiftMonthKey(selectedMonthKey, -1);
  render();
});
document.getElementById('monthNextBtn').addEventListener('click', ()=>{
  if(selectedMonthKey === currentMonthKey()) return; // can't go past the current month
  selectedMonthKey = shiftMonthKey(selectedMonthKey, 1);
  render();
});
document.getElementById('monthTodayBtn').addEventListener('click', ()=>{
  selectedMonthKey = currentMonthKey();
  render();
});

/* ---------------- nav ---------------- */
document.querySelectorAll('nav.bottom button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('nav.bottom button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
    document.getElementById('screen-'+btn.dataset.screen).classList.add('active');
  });
});

document.querySelectorAll('#screen-shared .subnav button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#screen-shared .subnav button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#screen-shared .sub-view').forEach(s=>s.classList.remove('active'));
    document.getElementById('subview-'+btn.dataset.subview).classList.add('active');
  });
});

document.querySelectorAll('#screen-add .subnav button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#screen-add .subnav button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#screen-add .sub-view').forEach(s=>s.classList.remove('active'));
    document.getElementById('addmode-'+btn.dataset.addmode).classList.add('active');
  });
});

document.querySelectorAll('#screen-budgets .subnav button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#screen-budgets .subnav button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('#screen-budgets .sub-view').forEach(s=>s.classList.remove('active'));
    document.getElementById('budgetview-'+btn.dataset.budgetview).classList.add('active');
  });
});

document.getElementById('toggleSettledBtn').addEventListener('click', ()=>{
  const el = document.getElementById('settledDebtsList');
  const showing = el.style.display !== 'none';
  el.style.display = showing ? 'none' : 'block';
  document.getElementById('toggleSettledBtn').textContent = showing ? 'Show settled' : 'Hide settled';
});

/* ---------------- version / changelog ---------------- */
document.getElementById('appVersionLabel').textContent = 'v' + APP_VERSION;
document.getElementById('changelogList').innerHTML = CHANGELOG.map(c=>`
  <div style="margin-bottom:12px">
    <div class="mono" style="font-weight:600;color:var(--paper)">v${c.version}</div>
    <ul style="margin:4px 0 0;padding-left:18px;color:var(--paper-dim);font-size:13px;line-height:1.6">
      ${c.notes.map(n=>`<li>${n}</li>`).join('')}
    </ul>
  </div>
`).join('');
document.getElementById('toggleChangelogBtn').addEventListener('click', ()=>{
  const el = document.getElementById('changelogList');
  const showing = el.style.display !== 'none';
  el.style.display = showing ? 'none' : 'block';
  document.getElementById('toggleChangelogBtn').textContent = showing ? 'View changelog' : 'Hide changelog';
});

/* ---------------- add to home screen reminder (iOS Safari, non-standalone) ---------------- */
(function initAddHomeBanner(){
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent);
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const dismissed = localStorage.getItem('ourbudget_addhome_dismissed');
  const banner = document.getElementById('addHomeBanner');
  if(isIOS && !isStandalone && !dismissed){
    banner.style.display = 'flex';
  }
  document.getElementById('dismissAddHomeBtn').addEventListener('click', ()=>{
    banner.style.display = 'none';
    localStorage.setItem('ourbudget_addhome_dismissed', '1');
  });
})();

/* ---------------- add transaction ---------------- */
let currentType = 'expense';
document.getElementById('typeExpenseBtn').addEventListener('click', ()=>{
  currentType='expense';
  document.getElementById('typeExpenseBtn').classList.add('active');
  document.getElementById('typeIncomeBtn').classList.remove('active');
  document.getElementById('categoryField').style.display = '';
  document.getElementById('paidByLabel').textContent = 'Paid by';
  updateActuallyForRow();
});
document.getElementById('typeIncomeBtn').addEventListener('click', ()=>{
  currentType='income';
  document.getElementById('typeIncomeBtn').classList.add('active');
  document.getElementById('typeExpenseBtn').classList.remove('active');
  document.getElementById('categoryField').style.display = 'none';
  document.getElementById('paidByLabel').textContent = 'Received by';
  updateActuallyForRow();
});
let currentScope = 'shared';
document.getElementById('scopeSharedBtn').addEventListener('click', ()=>{
  currentScope = 'shared';
  document.getElementById('scopeSharedBtn').classList.add('active');
  document.getElementById('scopePersonalBtn').classList.remove('active');
  updatePaidByOptions();
  updateScopeHint();
});
document.getElementById('scopePersonalBtn').addEventListener('click', ()=>{
  currentScope = 'personal';
  document.getElementById('scopePersonalBtn').classList.add('active');
  document.getElementById('scopeSharedBtn').classList.remove('active');
  updatePaidByOptions();
  updateScopeHint();
});
document.getElementById('fPaidBy').addEventListener('change', ()=>{ updateActuallyForRow(); updateFundHint(); });
document.getElementById('fAmount').addEventListener('input', updateFundHint);
document.getElementById('fDate').valueAsDate = new Date();

document.getElementById('submitTx').addEventListener('click', ()=>{
  const amount = document.getElementById('fAmount').value;
  if(!amount || Number(amount)<=0){ showToast('Enter an amount'); return; }
  const { p1, p2 } = names();
  const paidBy = document.getElementById('fPaidBy').value;
  const actuallyForChecked = document.getElementById('fActuallyFor').checked;
  const payload = {
    type: currentType,
    amount: amount,
    date: document.getElementById('fDate').value,
    category: currentType==='income' ? 'Income' : document.getElementById('fCategory').value,
    paidBy: paidBy,
    note: document.getElementById('fNote').value,
    scope: currentScope
  };
  if(actuallyForChecked && currentType==='expense'){
    payload.actuallyFor = paidBy===p1 ? p2 : p1;
  }
  optimisticAddTransaction(payload, 'Save transaction');
  showToast(payload.actuallyFor ? 'Saved — IOU added ✓' : 'Saved ✓');
  document.getElementById('fAmount').value='';
  document.getElementById('fNote').value='';
  document.getElementById('fActuallyFor').checked=false;
  document.querySelector('nav.bottom button[data-screen="dashboard"]').click();
});

document.getElementById('recentTx').addEventListener('click', (e)=>{
  if(e.target.classList.contains('tx-del')){
    optimisticDelete('transactions', e.target.dataset.id, 'deleteTransaction', 'Delete');
    showToast('Deleted');
  }
});

document.getElementById('budgetList').addEventListener('click', (e)=>{
  if(e.target.classList.contains('budget-save')){
    const cat = e.target.dataset.cat;
    const input = document.querySelector(`.budget-input[data-cat="${cat}"]`);
    const monthlyBudget = Number(input.value)||0;
    runOptimistic({
      patch: updateInListBy('categories', c=>c.name===cat, {monthlyBudget}),
      apiCall: () => apiPost('updateCategoryBudget', {name:cat, monthlyBudget}),
      label: 'Update budget'
    });
    showToast('Budget updated');
  }
  if(e.target.classList.contains('budget-del')){
    const cat = e.target.dataset.cat;
    if(!confirm(`Remove the "${cat}" category? Past transactions keep this category label, they just won't have a budget anymore.`)) return;
    runOptimistic({
      patch: removeFromListBy('categories', c=>c.name===cat),
      apiCall: () => apiPost('deleteCategoryBudget', {name:cat}),
      label: 'Remove category'
    });
    showToast('Category removed');
  }
});

document.getElementById('addCatBtn').addEventListener('click', ()=>{
  const name = document.getElementById('newCatName').value.trim();
  const monthlyBudget = Number(document.getElementById('newCatBudget').value)||0;
  if(!name){ showToast('Enter a category name'); return; }
  runOptimistic({
    patch: addToList('categories', {name, monthlyBudget}),
    apiCall: () => apiPost('updateCategoryBudget', { name, monthlyBudget }),
    label: 'Add category'
  });
  showToast('Category added ✓');
  document.getElementById('newCatName').value=''; document.getElementById('newCatBudget').value='';
});

document.getElementById('personalBudgetCards').addEventListener('click', (e)=>{
  if(e.target.classList.contains('personal-limit-save')){
    const key = e.target.dataset.key;
    const input = document.querySelector(`.personal-limit-input[data-key="${key}"]`);
    const val = Number(input.value || 0);
    const settingsKey = 'personalBudget'+key;
    runOptimistic({
      patch: (s)=>{ s.settings = {...(s.settings||{}), [settingsKey]: val}; return s; },
      apiCall: () => apiPost('updateSettings', {[settingsKey]: val}),
      label: 'Update personal budget'
    });
    showToast('Personal budget updated ✓');
  }
});

/* ---------------- savings goals ---------------- */
document.getElementById('addGoalBtn').addEventListener('click', ()=>{
  const name = document.getElementById('gName').value;
  const target = Number(document.getElementById('gTarget').value);
  if(!name || !target){ showToast('Name and target required'); return; }
  const currentAmount = Number(document.getElementById('gStart').value || 0);
  const deadline = document.getElementById('gDeadline').value;
  const id = genId();
  const goalObj = { id, name, targetAmount: target, currentAmount, deadline, createdAt: new Date().toISOString() };
  const opId = runOptimistic({
    patch: addToList('goals', goalObj),
    apiCall: () => apiPost('addGoal', { name, targetAmount: target, currentAmount, deadline }),
    onSuccess: (s, result) => addToList('goals', {...goalObj, id: result.id})(s),
    label: 'Create goal'
  });
  pendingCreateOpByTmpId[id] = opId;
  showToast('Goal created ✓');
  document.getElementById('gName').value=''; document.getElementById('gTarget').value=''; document.getElementById('gStart').value=''; document.getElementById('gDeadline').value='';
});

document.getElementById('goalsList').addEventListener('click', (e)=>{
  const id = e.target.dataset.id;
  if(e.target.classList.contains('goal-add-btn')){
    const input = document.querySelector(`.goal-add-input[data-id="${id}"]`);
    const add = Number(input.value||0);
    if(!add) return;
    const goal = (STATE.goals||[]).find(g=>g.id===id);
    if(!goal) return;
    const currentAmount = Number(goal.currentAmount)+add;
    runOptimistic({
      patch: updateInList('goals', id, {currentAmount}),
      apiCall: () => apiPost('updateGoal', {id, currentAmount}),
      label: 'Update goal'
    });
    showToast('Progress updated ✓');
  }
  if(e.target.classList.contains('goal-del-btn')){
    optimisticDelete('goals', id, 'deleteGoal', 'Remove goal');
    showToast('Goal removed');
  }
});

/* ---------------- food fund ---------------- */
// Shared by the manual "Add contribution" button and the "Settle & contribute"
// shortcut, so a repayment of a Food Fund IOU is a real contribution, not
// just a status flag with no matching money moving into the fund.
function optimisticAddFundContribution({ amount, by, date, note, label }){
  const nowIso = new Date().toISOString();
  const txId = genId(), fundId = genId();
  const applyObjects = (s, tId, fId) => {
    s.transactions = [...(s.transactions||[]), { id:tId, date, type:'expense', amount, category:'Food Fund', paidBy:by, note: note || 'Food Fund contribution', createdAt: nowIso, scope:'shared' }];
    const fund = s.foodFund || {balance:0, entries:[]};
    s.foodFund = { balance: fund.balance + amount, entries:[...(fund.entries||[]), { id:fId, type:'contribution', amount, by, note: note||'', date, createdAt: nowIso, linkedTransactionId: tId }] };
    return s;
  };
  runOptimistic({
    patch: (s) => applyObjects(s, txId, fundId),
    apiCall: () => apiPost('addFoodFundContribution', { amount, by, date }),
    onSuccess: (s, result) => applyObjects(s, result.transactionId, result.id),
    label: label || 'Add contribution'
  });
}

function openFoodFundDebtsFor(name){
  return (STATE.debts||[]).filter(d => d.status==='open' && d.fromWho===name && d.toWho===FOOD_FUND_LABEL);
}

// Warns whoever's selected in "Contribute" if they still owe the fund from a
// past receipt, and offers to clear it in one tap instead of a separate,
// easy-to-forget manual settle.
function updateFundContribWarning(){
  const sel = document.getElementById('fundContribBy');
  const warn = document.getElementById('fundContribWarning');
  if(!sel || !warn) return;
  const name = sel.value;
  const debts = openFoodFundDebtsFor(name);
  const owed = debts.reduce((s,d)=>s+Number(d.amount),0);
  const currency = (STATE.settings||{}).currency || 'AED';
  if(owed > 0){
    warn.style.display = 'block';
    warn.innerHTML = `<div class="balance-sub" style="color:var(--danger);margin:8px 0 0">
      ${name} already owes the Food Fund ${currency} ${fmt(owed)} from a past receipt — settle that first.
      <button class="ghost" id="fundSettleOwedBtn" data-name="${name.replace(/"/g,'&quot;')}" data-owed="${owed}" style="width:auto;padding:0 12px;margin-top:8px;display:block">Settle & contribute ${currency} ${fmt(owed)}</button>
    </div>`;
  } else {
    warn.style.display = 'none';
    warn.innerHTML = '';
  }
}
document.getElementById('fundContribBy').addEventListener('change', updateFundContribWarning);
document.getElementById('fundContribWarning').addEventListener('click', (e)=>{
  if(e.target.id !== 'fundSettleOwedBtn') return;
  const name = e.target.dataset.name;
  const owed = Number(e.target.dataset.owed);
  const date = new Date().toISOString().slice(0,10);
  openFoodFundDebtsFor(name).forEach(d=>{
    runOptimistic({
      patch: updateInList('debts', d.id, {status:'settled', settledAt: new Date().toISOString()}),
      apiCall: () => apiPost('settleDebt', {id: d.id}),
      label: 'Settle IOU'
    });
  });
  optimisticAddFundContribution({ amount: owed, by: name, date, note: 'Settling amount owed to Food Fund', label: 'Settle & contribute' });
  showToast(`${name} settled up with the Food Fund ✓`);
});

document.getElementById('fundContribBtn').addEventListener('click', ()=>{
  const amount = Number(document.getElementById('fundContribAmount').value);
  if(!amount || amount<=0){ showToast('Enter an amount'); return; }
  const by = document.getElementById('fundContribBy').value;
  const date = new Date().toISOString().slice(0,10);
  optimisticAddFundContribution({ amount, by, date });
  showToast('Contribution added ✓');
  document.getElementById('fundContribAmount').value='';
});

document.getElementById('fundSpendBtn').addEventListener('click', ()=>{
  const amount = Number(document.getElementById('fundSpendAmount').value);
  if(!amount || amount<=0){ showToast('Enter an amount'); return; }
  const by = document.getElementById('fundSpendBy').value;
  const note = document.getElementById('fundSpendNote').value;
  const date = new Date().toISOString().slice(0,10);
  const nowIso = new Date().toISOString();
  const txId = genId(), fundId = genId();
  const applyObjects = (s, tId, fId) => {
    s.transactions = [...(s.transactions||[]), { id:tId, date, type:'expense', amount, category:'Groceries', paidBy:by, note: note?('Food Fund: '+note):'Food Fund', createdAt: nowIso, scope:'fund' }];
    const fund = s.foodFund || {balance:0, entries:[]};
    s.foodFund = { balance: fund.balance - amount, entries:[...(fund.entries||[]), { id:fId, type:'spend', amount, by, note, date, createdAt: nowIso, linkedTransactionId: tId }] };
    return s;
  };
  runOptimistic({
    patch: (s) => applyObjects(s, txId, fundId),
    apiCall: () => apiPost('addFoodFundSpend', { amount, by, note, date }),
    onSuccess: (s, result) => applyObjects(s, result.transactionId, result.id),
    label: 'Log fund spend'
  });
  showToast('Spend logged ✓');
  document.getElementById('fundSpendAmount').value=''; document.getElementById('fundSpendNote').value='';
});

document.getElementById('fundHistory').addEventListener('click', ()=>{}); // reserved

/* ---------------- debts ---------------- */
// Shared optimistic path for creating an IOU, used by the manual "Add IOU"
// form and by receipt items tagged to a person while the Food Fund pays.
function optimisticAddDebt({ fromWho, toWho, amount, reason, date }){
  const id = genId();
  const debtObj = { id, fromWho, toWho, amount, reason, date, status:'open', createdAt: new Date().toISOString(), settledAt:'' };
  const opId = runOptimistic({
    patch: addToList('debts', debtObj),
    apiCall: () => apiPost('addDebt', { fromWho, toWho, amount, reason, date }),
    onSuccess: (s, result) => addToList('debts', {...debtObj, id: result.id})(s),
    label: 'Add IOU'
  });
  pendingCreateOpByTmpId[id] = opId;
  return id;
}

document.getElementById('addDebtBtn').addEventListener('click', ()=>{
  const from = document.getElementById('debtFrom').value;
  const to = document.getElementById('debtTo').value;
  const amount = Number(document.getElementById('debtAmount').value);
  const reason = document.getElementById('debtReason').value;
  if(from===to){ showToast('Pick two different people'); return; }
  if(!amount || amount<=0){ showToast('Enter an amount'); return; }
  const date = new Date().toISOString().slice(0,10);
  optimisticAddDebt({ fromWho: from, toWho: to, amount, reason, date });
  showToast('IOU added ✓');
  document.getElementById('debtAmount').value=''; document.getElementById('debtReason').value='';
});

document.getElementById('debtsList').addEventListener('click', (e)=>{
  const id = e.target.dataset.id;
  if(!id) return;
  const act = e.target.dataset.act;
  if(act==='settle'){
    runOptimistic({
      patch: updateInList('debts', id, {status:'settled', settledAt: new Date().toISOString()}),
      apiCall: () => apiPost('settleDebt', {id}),
      label: 'Settle IOU'
    });
    showToast('Marked settled ✓');
  }
  if(act==='delete'){
    optimisticDelete('debts', id, 'deleteDebt', 'Remove IOU');
    showToast('Removed');
  }
});

/* ---------------- settings ---------------- */
document.getElementById('saveConnBtn').addEventListener('click', async ()=>{
  const apiUrl = document.getElementById('sApiUrl').value.trim();
  const passcode = document.getElementById('sPasscode').value.trim();
  if(!apiUrl){ showToast('Paste your Apps Script URL'); return; }
  setConfig({...getConfig(), apiUrl, passcode});
  showToast('Saved — connecting…');
  await loadAll();
});
document.getElementById('testConnBtn').addEventListener('click', async ()=>{
  try{ await apiGet('getAll'); showToast('Connected ✓'); } catch(err){ showToast('Failed: '+err.message); }
});
document.getElementById('saveNamesBtn').addEventListener('click', ()=>{
  const partner1Name = document.getElementById('sP1Name').value;
  const partner2Name = document.getElementById('sP2Name').value;
  runOptimistic({
    patch: (s)=>{ s.settings = {...(s.settings||{}), partner1Name, partner2Name}; return s; },
    apiCall: () => apiPost('updateSettings', { partner1Name, partner2Name }),
    label: 'Update names'
  });
  showToast('Names updated ✓');
});
document.getElementById('saveGeminiBtn').addEventListener('click', ()=>{
  const key = document.getElementById('sGeminiKey').value.trim();
  setConfig({...getConfig(), geminiKey: key});
  showToast(key ? 'Gemini key saved ✓' : 'Key cleared');
});

/* ---------------- receipt scanning ---------------- */
let scanFileData = null; // {base64, mimeType}

document.getElementById('scanDrop').addEventListener('click', ()=> document.getElementById('scanFile').click());
document.getElementById('scanFile').addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    const base64 = reader.result.split(',')[1];
    scanFileData = { base64, mimeType: file.type || 'image/jpeg' };
    document.getElementById('scanDrop').textContent = `Selected: ${file.name}`;
    document.getElementById('scanDrop').classList.add('has-file');
  };
  reader.readAsDataURL(file);
});

document.getElementById('scanBtn').addEventListener('click', async ()=>{
  const cfg = getConfig();
  if(!cfg.geminiKey){ showToast('Add your Gemini API key in Settings first'); return; }
  if(!scanFileData){ showToast('Choose a photo or PDF first'); return; }

  const btn = document.getElementById('scanBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Reading receipt…';
  try{
    const items = await callGemini(scanFileData.base64, scanFileData.mimeType);
    scannedItems = items.map((it,i)=>({ id: 'i'+i, name: it.name, price: Number(it.price)||0, tag: 'shared' }));
    renderScanItems();
    document.getElementById('scanResultsCard').style.display = 'block';
    showToast(`Found ${scannedItems.length} item(s) — review below`);
  }catch(err){
    showToast('Scan failed: ' + err.message);
  }finally{
    btn.disabled = false;
    btn.textContent = 'Scan with AI';
  }
});

async function callGemini(base64, mimeType){
  const cfg = getConfig();
  const prompt = `Extract every purchased line item from this receipt image or PDF. Respond with ONLY valid JSON, no markdown fences, no explanation, in exactly this shape:
{"items":[{"name":"string","price":number}]}
Use the final price per line (after any discount) as a plain number, no currency symbols. Skip subtotal/tax/total lines — only real purchased items.`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(cfg.geminiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [
        { text: prompt },
        { inline_data: { mime_type: mimeType, data: base64 } }
      ]}]
    })
  });
  const json = await res.json();
  if(json.error) throw new Error(json.error.message || 'Gemini request failed');
  const text = json.candidates?.[0]?.content?.parts?.map(p=>p.text).join('') || '';
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if(start===-1 || end===-1) throw new Error('Could not read a response');
  const parsed = JSON.parse(cleaned.slice(start, end+1));
  if(!parsed.items || !parsed.items.length) throw new Error('No items found — try a clearer photo');
  return parsed.items;
}

function renderScanItems(){
  const { p1, p2 } = names();
  const payer = document.getElementById('scanPaidBy').value || p1;
  const isFund = payer === FOOD_FUND_LABEL;
  const other = payer === p1 ? p2 : p1;

  document.getElementById('scanItems').innerHTML = scannedItems.map(it=>`
    <div class="item-row" data-id="${it.id}">
      <input type="text" class="item-name" value="${it.name.replace(/"/g,'&quot;')}">
      <input type="number" class="item-price" value="${it.price}" inputmode="decimal">
      ${isFund ? `
      <select class="item-tag">
        <option value="shared" ${(!it.tag||it.tag==='shared')?'selected':''}>Shared (fund keeps it)</option>
        <option value="p1" ${it.tag==='p1'?'selected':''}>${p1} owes the fund</option>
        <option value="p2" ${it.tag==='p2'?'selected':''}>${p2} owes the fund</option>
      </select>` : `
      <select class="item-tag">
        <option value="mine" ${it.tag==='mine'?'selected':''}>${payer} (payer)</option>
        <option value="other" ${it.tag==='other'?'selected':''}>${other}</option>
        <option value="shared" ${it.tag==='shared'?'selected':''}>Shared</option>
      </select>`}
      <button class="item-del" data-id="${it.id}">✕</button>
    </div>
  `).join('');
  updateReceiptSummary();
}

function syncScanItemsFromDOM(){
  document.querySelectorAll('#scanItems .item-row').forEach(row=>{
    const id = row.dataset.id;
    const it = scannedItems.find(x=>x.id===id);
    if(!it) return;
    it.name = row.querySelector('.item-name').value;
    it.price = Number(row.querySelector('.item-price').value)||0;
    const tagSel = row.querySelector('.item-tag');
    if(tagSel) it.tag = tagSel.value;
  });
}

function updateReceiptSummary(){
  syncScanItemsFromDOM();
  const currency = (STATE.settings||{}).currency || 'AED';
  const { p1, p2 } = names();
  const payer = document.getElementById('scanPaidBy').value || p1;
  const other = payer === p1 ? p2 : p1;

  if(payer === FOOD_FUND_LABEL){
    const p1Owed = scannedItems.filter(i=>i.tag==='p1').reduce((s,i)=>s+i.price,0);
    const p2Owed = scannedItems.filter(i=>i.tag==='p2').reduce((s,i)=>s+i.price,0);
    const total = scannedItems.reduce((s,i)=>s+i.price,0);
    const balance = (STATE.foodFund||{}).balance || 0;
    const over = total > balance;
    let html = `<b>Food Fund</b> pays: ${currency} ${fmt(total)}<br>` +
      `<span style="color:${over ? 'var(--danger)' : 'var(--paper-dim)'}">Fund balance: ${currency} ${fmt(balance)}${over ? ' — this will take it negative' : ''}</span>`;
    if(p1Owed > 0) html += `<br><b>${p1}</b> owes the Food Fund: ${currency} ${fmt(p1Owed)} → auto-logged as an IOU`;
    if(p2Owed > 0) html += `<br><b>${p2}</b> owes the Food Fund: ${currency} ${fmt(p2Owed)} → auto-logged as an IOU`;
    document.getElementById('receiptSummary').innerHTML = html;
    return;
  }

  const mineTotal = scannedItems.filter(i=>i.tag==='mine').reduce((s,i)=>s+i.price,0);
  const sharedTotal = scannedItems.filter(i=>i.tag==='shared').reduce((s,i)=>s+i.price,0);
  const otherTotal = scannedItems.filter(i=>i.tag==='other').reduce((s,i)=>s+i.price,0);
  const payerTxTotal = mineTotal + sharedTotal;

  document.getElementById('receiptSummary').innerHTML =
    `<b>${payer}</b> pays: ${currency} ${fmt(payerTxTotal)} (own + shared)<br>` +
    (otherTotal > 0 ? `<b>${other}</b>'s share, fronted by ${payer}: ${currency} ${fmt(otherTotal)} → auto-logged as an IOU` : `No items tagged for ${other}`);
}

document.getElementById('scanItems').addEventListener('input', updateReceiptSummary);
document.getElementById('scanItems').addEventListener('change', updateReceiptSummary);
document.getElementById('scanPaidBy').addEventListener('change', ()=>{ syncScanItemsFromDOM(); renderScanItems(); });

document.getElementById('scanItems').addEventListener('click', (e)=>{
  if(e.target.classList.contains('item-del')){
    syncScanItemsFromDOM();
    scannedItems = scannedItems.filter(i=>i.id !== e.target.dataset.id);
    renderScanItems();
  }
});

document.getElementById('addItemBtn').addEventListener('click', ()=>{
  syncScanItemsFromDOM();
  scannedItems.push({ id: 'i'+Date.now(), name: '', price: 0, tag: 'shared' });
  renderScanItems();
});

document.getElementById('saveReceiptBtn').addEventListener('click', ()=>{
  syncScanItemsFromDOM();
  const { p1, p2 } = names();
  const payer = document.getElementById('scanPaidBy').value || p1;
  const other = payer === p1 ? p2 : p1;
  const category = document.getElementById('scanCategory').value;
  const date = new Date().toISOString().slice(0,10);
  const itemNames = it => it.map(i=>i.name).filter(Boolean).join(', ');

  const isFund = payer === FOOD_FUND_LABEL;

  if(isFund){
    const total = scannedItems.reduce((s,i)=>s+i.price,0);
    if(total<=0){ showToast('Add at least one item with a price'); return; }
    optimisticAddTransaction({ type:'expense', amount: total, date, category, paidBy: FOOD_FUND_LABEL, note: 'Receipt: '+itemNames(scannedItems) }, 'Save receipt');

    let iouNote = '';
    [{ name: p1, tag: 'p1' }, { name: p2, tag: 'p2' }].forEach(person=>{
      const owed = scannedItems.filter(i=>i.tag===person.tag).reduce((s,i)=>s+i.price,0);
      if(owed > 0){
        optimisticAddDebt({ fromWho: person.name, toWho: FOOD_FUND_LABEL, amount: owed, reason: category || 'Receipt items', date });
        iouNote += ` — ${person.name} owes the fund ${owed.toFixed(2)}`;
      }
    });
    showToast('Receipt saved ✓' + iouNote);
  } else {
    const payerItems = scannedItems.filter(i=> i.tag==='mine' || i.tag==='shared');
    const otherItems = scannedItems.filter(i=> i.tag==='other');
    const payerTotal = payerItems.reduce((s,i)=>s+i.price,0);
    const otherTotal = otherItems.reduce((s,i)=>s+i.price,0);

    if(payerTotal<=0 && otherTotal<=0){ showToast('Add at least one item with a price'); return; }

    if(payerTotal > 0){
      optimisticAddTransaction({ type:'expense', amount: payerTotal, date, category, paidBy: payer, note: 'Receipt: '+itemNames(payerItems) }, 'Save receipt');
    }
    if(otherTotal > 0){
      optimisticAddTransaction({ type:'expense', amount: otherTotal, date, category, paidBy: payer, note: 'Receipt (for '+other+'): '+itemNames(otherItems), actuallyFor: other }, 'Save receipt');
    }
    showToast('Receipt saved ✓' + (otherTotal>0 ? ' — IOU added' : ''));
  }

  scannedItems = [];
  scanFileData = null;
  document.getElementById('scanFile').value = '';
  document.getElementById('scanDrop').textContent = 'Tap to take a photo or choose a file';
  document.getElementById('scanDrop').classList.remove('has-file');
  document.getElementById('scanResultsCard').style.display = 'none';
  document.querySelector('nav.bottom button[data-screen="dashboard"]').click();
});

/* ---------------- auto refresh ---------------- */
// Quietly re-sync with the Sheet every 30s while the app is open and visible.
setInterval(()=>{
  if(document.visibilityState === 'visible' && getConfig().apiUrl){
    loadAll(false);
  }
}, 30000);

// Also refresh the moment the app comes back to the foreground
// (switching apps, unlocking the phone, reopening from the home screen).
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible' && getConfig().apiUrl){
    loadAll(false);
  }
});
window.addEventListener('focus', ()=>{
  if(getConfig().apiUrl) loadAll(false);
});

/* ---------------- pull-to-refresh ---------------- */
(function setupPullToRefresh(){
  let startY = 0, pulling = false, distance = 0, refreshing = false;
  const PULL_THRESHOLD = 64;
  const indicator = document.getElementById('pullIndicator');
  const spinner = document.getElementById('pullSpinner');
  const text = document.getElementById('pullText');

  function setIndicator(y){
    indicator.style.transform = `translate(-50%, ${y}px)`;
  }

  window.addEventListener('touchstart', (e)=>{
    if(refreshing) return;
    if(window.scrollY <= 0){
      startY = e.touches[0].clientY;
      pulling = true;
    }
  }, { passive: true });

  window.addEventListener('touchmove', (e)=>{
    if(!pulling || refreshing) return;
    const dy = e.touches[0].clientY - startY;
    if(dy > 0 && window.scrollY <= 0){
      distance = Math.min(dy * 0.5, 100);
      setIndicator(distance - 10);
      text.textContent = distance > PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh';
      if(e.cancelable) e.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('touchend', async ()=>{
    if(!pulling) return;
    pulling = false;
    if(distance > PULL_THRESHOLD && !refreshing){
      refreshing = true;
      spinner.style.display = 'inline-block';
      text.textContent = 'Refreshing…';
      setIndicator(20);
      await loadAll(true, true);
      spinner.style.display = 'none';
      setIndicator(-100);
      refreshing = false;
    } else {
      setIndicator(-100);
    }
    distance = 0;
  });
})();

/* ---------------- init ---------------- */
(function init(){
  const cfg = getConfig();
  if(cfg.apiUrl) document.getElementById('sApiUrl').value = cfg.apiUrl;
  if(cfg.passcode) document.getElementById('sPasscode').value = cfg.passcode;
  if(cfg.geminiKey) document.getElementById('sGeminiKey').value = cfg.geminiKey;

  const cached = getCache();
  if(cached){ CONFIRMED = cached; confirmedLoadedOnce = true; recompute(); }

  if(cfg.apiUrl){ loadAll(); }
  else{
    showToast('Set up your connection in Settings');
    document.querySelector('nav.bottom button[data-screen="settings"]').click();
  }

  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').then((reg)=>{
      // Standalone home-screen apps rarely re-check for a new service worker
      // on their own, so a shipped fix can sit uninstalled indefinitely.
      // Actively check on load and whenever the app is brought back to the
      // foreground, so a new release is picked up promptly.
      reg.update().catch(()=>{});
      document.addEventListener('visibilitychange', ()=>{
        if(document.visibilityState === 'visible') reg.update().catch(()=>{});
      });
    }).catch(()=>{});

    // Once a newly-installed worker activates and takes control, this page
    // is still running the OLD cached app shell (old HTML/CSS/JS already
    // loaded into memory) — reload once so the new version is actually shown
    // instead of silently staying stale until the next manual relaunch.
    let swRefreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', ()=>{
      if(swRefreshed) return;
      swRefreshed = true;
      location.reload();
    });
  }
})();
