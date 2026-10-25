import {
  fmt, monthKey, dateKey, addMonths, parseMonth, monthSeq, monthTotal, usersIn, effectiveBudget, budgetStatus,
  savingsRows, topSubcategories, txMatchesFilter, categoryColor, recurringToCopy,
  categoryRemovalPlan, describeCategoryRemoval, transactionsToCSV
} from "./lib.js";
import { createPocketBaseApi, createMemoryApi } from "./api.js";
import { generateDemoData, DEMO_USERS } from "./demo-data.js";

// ===== Config (override in config.js — see config.example.js) =====
// Demo mode (?demo in the URL) uses a fake household kept in memory and never touches PocketBase.
const DEMO = new URLSearchParams(location.search).has("demo");
const CONFIG = window.BUDGET_CONFIG || {};
const USERS = DEMO ? DEMO_USERS : (CONFIG.users && CONFIG.users.length) ? CONFIG.users : [
  { id: "user1", label: "User 1", color: "#36a2eb" },
  { id: "user2", label: "User 2", color: "#e44d7b" }
];
const STORAGE_PREFIX = DEMO ? "demo:" : "";

// ===== Data backend =====
// pbUrl "" = same origin as the page (PocketBase serves pb_public/).
const api = DEMO ? createMemoryApi(generateDemoData()) : createPocketBaseApi(CONFIG.pbUrl || "");
const pbList = c => api.list(c);
const pbCreate = (c, body) => api.create(c, body);
const pbUpdate = (c, id, body) => api.update(c, id, body);
const pbDelete = (c, id) => api.remove(c, id);

if (DEMO) document.getElementById("demoBanner").hidden = false;

// ===== Data =====
let categoryData = {};
let categoryMeta = {}; // category name -> PocketBase record id
let transactions = [];
let incomeTransactions = [];
let standardBudgets = [];
let monthlyBudgets = [];
let activeUser = localStorage.getItem(STORAGE_PREFIX + "activeUser");
if (activeUser !== "all" && !USERS.some(u => u.id === activeUser)) activeUser = USERS[0].id;

async function loadData() {
  const byUser = r => activeUser === "all" || r.user === activeUser;
  try {
    const [txRaw, incRaw, sbRaw, mbRaw, catRaw] = await Promise.all([
      pbList("transactions"),
      pbList("income"),
      pbList("standard_budgets"),
      pbList("monthly_budgets"),
      pbList("category_data")
    ]);
    transactions = txRaw.filter(byUser).map(r => ({
      _pbId: r.id, user: r.user, date: r.date, category: r.category,
      subcategory: r.subcategory, description: r.description,
      amount: r.amount, recurring: r.recurring
    }));
    incomeTransactions = incRaw.filter(byUser).map(r => ({
      _pbId: r.id, user: r.user, date: r.date, source: r.source, amount: r.amount
    }));
    standardBudgets = sbRaw.filter(byUser).map(r => ({
      _pbId: r.id, user: r.user, category: r.category, amount: r.amount
    }));
    monthlyBudgets = mbRaw.filter(byUser).map(r => ({
      _pbId: r.id, user: r.user, month: r.month, category: r.category, amount: r.amount
    }));
    categoryData = {};
    categoryMeta = {};
    catRaw.forEach(r => {
      categoryData[r.name] = Array.isArray(r.subcategories) ? r.subcategories : [];
      categoryMeta[r.name] = r.id;
    });
  } catch(e) {
    showToast("Could not connect to PocketBase. Is it running?");
  }
}

// ===== Elements =====
const monthSelector = document.getElementById("monthSelector");
const transactionTableBody = document.getElementById("transactionTableBody");
const incomeTableBody = document.getElementById("incomeTableBody");
const budgetTableBody = document.getElementById("budgetTableBody");
const standardCategorySelect = document.getElementById("standardCategorySelect");
const standardBudgetAmount = document.getElementById("standardBudgetAmount");
const reportRange = document.getElementById("reportRange");
const reportCategory = document.getElementById("reportCategory");
const subcategoryCategorySelect = document.getElementById("subcategoryCategorySelect");
const removeCategorySelect = document.getElementById("removeCategorySelect");
const removeSubcategoryCategorySelect = document.getElementById("removeSubcategoryCategorySelect");
const removeSubcategorySelect = document.getElementById("removeSubcategorySelect");

// Charts contexts
const budgetChartCtx = document.getElementById("budgetChart").getContext("2d");
const pieCtx = document.getElementById("spendingPieChart").getContext("2d");
const incomeVsSpendingChartCtx = document.getElementById("incomeVsSpendingChart").getContext("2d");
const lineCtx = document.getElementById("spendingLineChart").getContext("2d");
const categoryTotalsChartCtx = document.getElementById("categoryTotalsChart").getContext("2d");
const subcategoryTrendChartCtx = document.getElementById("subcategoryTrendChart").getContext("2d");

let budgetChart, spendingPieChart, spendingLineChart, incomeVsSpendingChart, categoryTotalsChart, subcategoryTrendChart;

// ===== Helpers =====
function currentMonth() { return (monthSelector.value || monthKey(new Date())); }
function todayStr() { return dateKey(new Date()); }
function userLabel(id) { return USERS.find(u => u.id === id)?.label || id; }
function showToast(message, type = "error") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.getElementById("toastContainer").appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
function budgetUser() {
  return activeUser === "all" ? USERS[0].id : activeUser;
}
function makeUserBadge(userId) {
  const badge = document.createElement("span");
  badge.className = "user-badge";
  const u = USERS.find(x => x.id === userId);
  if (u?.color) badge.style.background = u.color;
  badge.textContent = u?.label || userId || "";
  return badge;
}
function getEffectiveBudget(cat, month) {
  const users = activeUser === "all"
    ? usersIn(transactions, incomeTransactions, standardBudgets, monthlyBudgets)
    : [activeUser];
  return effectiveBudget(cat, month, users, standardBudgets, monthlyBudgets);
}

let txFilter = "";

function populateCategories() {
  standardCategorySelect.innerHTML = "";
  reportCategory.innerHTML = "";
  subcategoryCategorySelect.innerHTML = "";
  removeCategorySelect.innerHTML = "";
  removeSubcategoryCategorySelect.innerHTML = "";

  Object.keys(categoryData).forEach(cat => {
    standardCategorySelect.add(new Option(cat, cat));
    reportCategory.add(new Option(cat, cat));
    subcategoryCategorySelect.add(new Option(cat, cat));
    removeCategorySelect.add(new Option(cat, cat));
    removeSubcategoryCategorySelect.add(new Option(cat, cat));
  });

  updateRemoveSubcategoryOptions();
}

function updateRemoveSubcategoryOptions() {
  const cat = removeSubcategoryCategorySelect.value;
  removeSubcategorySelect.innerHTML = "";
  if (categoryData[cat]) {
    categoryData[cat].forEach(sub => {
      removeSubcategorySelect.add(new Option(sub, sub));
    });
  }
}
removeSubcategoryCategorySelect.addEventListener("change", updateRemoveSubcategoryOptions);

// ===== Inline editors =====
function makeInput(initial, type = "text", opts = {}) {
  const el = document.createElement(type === "select" ? "select" : "input");
  if (type !== "select") el.type = type;
  if (initial !== undefined && type !== "select") el.value = initial;
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.step) el.step = opts.step;
  if (opts.min !== undefined) el.min = opts.min;
  if (type === "select" && opts.options) {
    opts.options.forEach(o => el.add(new Option(o, o)));
    if (initial !== undefined) el.value = initial;
  }
  return el;
}
function activateCellEdit(td, value, type, onCommit, opts = {}) {
  if (td.querySelector("input,select")) return;
  const input = makeInput(value, type, opts);
  const oldHTML = td.innerHTML;
  td.innerHTML = "";
  td.appendChild(input);
  input.focus();
  if (type === "number") input.select();

  let committed = false;
  const commit = () => {
    if (committed) return;
    committed = true;
    const val = (type === "number") ? parseFloat(input.value) : input.value;
    if (type === "number" && isNaN(val)) { td.innerHTML = oldHTML; return; }
    onCommit(val);
  };
  const cancel = () => { if (!committed) { committed = true; td.innerHTML = oldHTML; } };

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") commit();
    else if (e.key === "Escape") cancel();
  });
  input.addEventListener("blur", commit);
}

// ===== Transactions Table =====
function renderTransactionsTable(month) {
  transactionTableBody.innerHTML = "";

  if (activeUser === "all") {
    const noteRow = document.createElement("tr");
    noteRow.innerHTML = `<td colspan="7" class="muted" style="text-align:center;padding:10px;">Viewing all users. Select a specific user to add or edit transactions.</td>`;
    transactionTableBody.appendChild(noteRow);
  } else {
    // Inline add row
    const addRow = document.createElement("tr");
    const addDate = makeInput(todayStr(), "date");
    const addCat = makeInput("", "select", { options: Object.keys(categoryData) });
    const addSub = makeInput("", "select", { options: categoryData[addCat.value] || [] });
    const addDesc = makeInput("", "text", { placeholder: "Store/Description" });
    const addAmt = makeInput("", "number", { step: "0.01" });
    const addRec = document.createElement("input"); addRec.type = "checkbox";
    const addBtnTd = document.createElement("td");
    const addBtn = document.createElement("button");
    addBtn.textContent = "Add";
    addBtn.className = "btn";
    addBtn.onclick = async () => {
      if (!addDate.value || !addCat.value || !addSub.value || addAmt.value === "") {
        showToast("Fill all required fields to add a transaction.");
        return;
      }
      try {
        const rec = await pbCreate("transactions", {
          user: activeUser, date: addDate.value, category: addCat.value,
          subcategory: addSub.value, description: addDesc.value,
          amount: parseFloat(addAmt.value), recurring: !!addRec.checked
        });
        transactions.push({ _pbId: rec.id, user: activeUser, date: rec.date, category: rec.category, subcategory: rec.subcategory, description: rec.description, amount: rec.amount, recurring: rec.recurring });
        renderAll();
      } catch(e) { showToast("Failed to save transaction."); }
    };
    addBtnTd.appendChild(addBtn);

    addCat.addEventListener("change", () => {
      addSub.innerHTML = "";
      (categoryData[addCat.value] || []).forEach(s => addSub.add(new Option(s, s)));
    });

    const c1 = document.createElement("td"); c1.appendChild(addDate);
    const c2 = document.createElement("td"); c2.appendChild(addCat);
    const c3 = document.createElement("td"); c3.appendChild(addSub);
    const c4 = document.createElement("td"); c4.appendChild(addDesc);
    const c5 = document.createElement("td"); c5.appendChild(addAmt);
    const c6 = document.createElement("td"); c6.appendChild(addRec);
    addRow.append(c1,c2,c3,c4,c5,c6,addBtnTd);
    transactionTableBody.appendChild(addRow);
  }

  // Existing rows (filtered by month + search, newest first)
  const filteredTx = transactions
    .filter(t => t.date && t.date.startsWith(month) && txMatchesFilter(t, txFilter))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (filteredTx.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="7" class="table-empty">No transactions${txFilter ? " matching your search" : " for this month"}.</td>`;
    transactionTableBody.appendChild(emptyRow);
  } else {
    filteredTx.forEach(t => {
      const tr = document.createElement("tr");
      const readonly = activeUser === "all";

      const tdDate = document.createElement("td");
      tdDate.textContent = t.date;
      if (!readonly) tdDate.ondblclick = () => activateCellEdit(tdDate, t.date, "date", async (val) => {
        try { await pbUpdate("transactions", t._pbId, { date: val }); t.date = val; renderAll(); }
        catch(e) { showToast("Failed to update."); }
      });

      const tdCat = document.createElement("td");
      tdCat.textContent = t.category;
      if (!readonly) tdCat.ondblclick = () => activateCellEdit(tdCat, t.category, "select", async (val) => {
        try {
          const newSub = categoryData[val]?.includes(t.subcategory) ? t.subcategory : (categoryData[val] || [])[0] || "";
          await pbUpdate("transactions", t._pbId, { category: val, subcategory: newSub });
          t.category = val; t.subcategory = newSub; renderAll();
        } catch(e) { showToast("Failed to update."); }
      }, { options: Object.keys(categoryData) });

      const tdSub = document.createElement("td");
      tdSub.textContent = t.subcategory;
      if (!readonly) tdSub.ondblclick = () => activateCellEdit(tdSub, t.subcategory, "select", async (val) => {
        try { await pbUpdate("transactions", t._pbId, { subcategory: val }); t.subcategory = val; renderAll(); }
        catch(e) { showToast("Failed to update."); }
      }, { options: categoryData[t.category] || [] });

      const tdDesc = document.createElement("td");
      tdDesc.textContent = t.description || "";
      if (!readonly) tdDesc.ondblclick = () => activateCellEdit(tdDesc, t.description || "", "text", async (val) => {
        try { await pbUpdate("transactions", t._pbId, { description: val }); t.description = val; renderAll(); }
        catch(e) { showToast("Failed to update."); }
      }, { placeholder: "Store/Description" });

      const tdAmt = document.createElement("td");
      tdAmt.textContent = fmt(t.amount);
      if (!readonly) tdAmt.ondblclick = () => activateCellEdit(tdAmt, t.amount, "number", async (val) => {
        try { await pbUpdate("transactions", t._pbId, { amount: val }); t.amount = val; renderAll(); }
        catch(e) { showToast("Failed to update."); }
      }, { step: "0.01" });

      const tdRec = document.createElement("td");
      const chk = document.createElement("input"); chk.type = "checkbox"; chk.checked = !!t.recurring;
      chk.disabled = readonly;
      chk.addEventListener("change", async () => {
        try { await pbUpdate("transactions", t._pbId, { recurring: chk.checked }); t.recurring = chk.checked; }
        catch(e) { showToast("Failed to update."); chk.checked = !chk.checked; }
      });
      tdRec.appendChild(chk);

      const tdAct = document.createElement("td");
      if (!readonly) {
        const del = document.createElement("button"); del.textContent = "Delete"; del.className="btn btn-danger";
        del.onclick = async () => {
          if (confirm("Delete this transaction?")) {
            try {
              await pbDelete("transactions", t._pbId);
              transactions = transactions.filter(x => x._pbId !== t._pbId);
              renderAll();
            } catch(e) { showToast("Failed to delete."); }
          }
        };
        tdAct.appendChild(del);
      }

      if (activeUser === "all") tdDate.appendChild(makeUserBadge(t.user));

      tr.append(tdDate, tdCat, tdSub, tdDesc, tdAmt, tdRec, tdAct);
      transactionTableBody.appendChild(tr);
    });

    // Totals row
    const total = filteredTx.reduce((s, t) => s + t.amount, 0);
    const totalRow = document.createElement("tr");
    totalRow.style.fontWeight = "600";
    totalRow.innerHTML = `<td colspan="4" style="text-align:right;">Total</td><td>${fmt(total)}</td><td colspan="2"></td>`;
    transactionTableBody.appendChild(totalRow);
  }
}

// ===== Income Table =====
function renderIncomeTable(month) {
  incomeTableBody.innerHTML = "";

  if (activeUser === "all") {
    const noteRow = document.createElement("tr");
    noteRow.innerHTML = `<td colspan="4" class="muted" style="text-align:center;padding:10px;">Viewing all users. Select a specific user to add or edit income.</td>`;
    incomeTableBody.appendChild(noteRow);
  } else {
    // Inline add row
    const addRow = document.createElement("tr");
    const addDate = makeInput(todayStr(), "date");
    const addSource = makeInput("", "text", { placeholder: "Source" });
    const addAmt = makeInput("", "number", { step: "0.01" });
    const addBtnTd = document.createElement("td");
    const addBtn = document.createElement("button");
    addBtn.textContent = "Add";
    addBtn.className = "btn";
    addBtn.onclick = async () => {
      if (!addDate.value || !addSource.value || addAmt.value === "") {
        showToast("Fill all fields to add income.");
        return;
      }
      try {
        const rec = await pbCreate("income", { user: activeUser, date: addDate.value, source: addSource.value, amount: parseFloat(addAmt.value) });
        incomeTransactions.push({ _pbId: rec.id, user: activeUser, date: rec.date, source: rec.source, amount: rec.amount });
        renderAll();
      } catch(e) { showToast("Failed to save income."); }
    };
    addBtnTd.appendChild(addBtn);

    const c1 = document.createElement("td"); c1.appendChild(addDate);
    const c2 = document.createElement("td"); c2.appendChild(addSource);
    const c3 = document.createElement("td"); c3.appendChild(addAmt);
    addRow.append(c1,c2,c3,addBtnTd);
    incomeTableBody.appendChild(addRow);
  }

  // Existing rows (newest first)
  const filteredIncome = incomeTransactions
    .filter(t => t.date && t.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));

  if (filteredIncome.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="4" class="table-empty">No income for this month.</td>`;
    incomeTableBody.appendChild(emptyRow);
  } else {
    const readonly = activeUser === "all";
    filteredIncome.forEach(t => {
      const tr = document.createElement("tr");

      const tdDate = document.createElement("td");
      tdDate.textContent = t.date;
      if (!readonly) tdDate.ondblclick = () => activateCellEdit(tdDate, t.date, "date", async (val) => {
        try { await pbUpdate("income", t._pbId, { date: val }); t.date = val; renderAll(); }
        catch(e) { showToast("Failed to update."); }
      });

      const tdSource = document.createElement("td");
      tdSource.textContent = t.source;
      if (!readonly) tdSource.ondblclick = () => activateCellEdit(tdSource, t.source, "text", async (val) => {
        try { await pbUpdate("income", t._pbId, { source: val }); t.source = val; renderAll(); }
        catch(e) { showToast("Failed to update."); }
      });

      const tdAmt = document.createElement("td");
      tdAmt.textContent = fmt(t.amount);
      if (!readonly) tdAmt.ondblclick = () => activateCellEdit(tdAmt, t.amount, "number", async (val) => {
        try { await pbUpdate("income", t._pbId, { amount: val }); t.amount = val; renderAll(); }
        catch(e) { showToast("Failed to update."); }
      }, { step: "0.01" });

      const tdAct = document.createElement("td");
      if (!readonly) {
        const del = document.createElement("button"); del.textContent = "Delete"; del.className="btn btn-danger";
        del.onclick = async () => {
          if (confirm("Delete this income?")) {
            try {
              await pbDelete("income", t._pbId);
              incomeTransactions = incomeTransactions.filter(x => x._pbId !== t._pbId);
              renderAll();
            } catch(e) { showToast("Failed to delete."); }
          }
        };
        tdAct.appendChild(del);
      }

      if (activeUser === "all") tdDate.appendChild(makeUserBadge(t.user));

      tr.append(tdDate, tdSource, tdAmt, tdAct);
      incomeTableBody.appendChild(tr);
    });
  }
}

// ===== Budgets Table =====
function renderBudgetRow(cat, budget, spent, month) {
  const { remaining, className, pct, barColor } = budgetStatus(budget, spent);

  const tr = document.createElement("tr");
  const readonly = activeUser === "all";
  const bu = budgetUser();

  const tdCat = document.createElement("td"); tdCat.textContent = cat;

  const tdBudget = document.createElement("td");
  tdBudget.textContent = fmt(budget);
  tdBudget.title = "Double-click to set/clear this month's budget override.";
  if (!readonly) tdBudget.ondblclick = () => activateCellEdit(tdBudget, budget, "number", async (val) => {
    const existing = monthlyBudgets.find(b => b.month === month && b.category === cat && b.user === bu);
    try {
      if (isNaN(val) || val === 0) {
        if (existing) {
          await pbDelete("monthly_budgets", existing._pbId);
          monthlyBudgets = monthlyBudgets.filter(b => b._pbId !== existing._pbId);
        }
      } else if (existing) {
        await pbUpdate("monthly_budgets", existing._pbId, { amount: val });
        existing.amount = val;
      } else {
        const rec = await pbCreate("monthly_budgets", { user: bu, month, category: cat, amount: val });
        monthlyBudgets.push({ _pbId: rec.id, user: bu, month, category: cat, amount: val });
      }
      renderAll();
    } catch(e) { showToast("Failed to update budget."); }
  }, { step: "0.01", min: 0 });

  const tdSpent = document.createElement("td");
  tdSpent.className = className;
  tdSpent.textContent = fmt(spent);
  if (pct !== null) {
    const bar = document.createElement("div"); bar.className = "budget-bar";
    const fill = document.createElement("div"); fill.className = "budget-bar-fill";
    fill.style.width = pct + "%"; fill.style.background = barColor;
    bar.appendChild(fill); tdSpent.appendChild(bar);
  }

  const tdRemain = document.createElement("td"); tdRemain.textContent = fmt(remaining); tdRemain.className = className;

  const tdAct = document.createElement("td");
  if (!readonly) {
    const clear = document.createElement("button"); clear.textContent = "Clear Override"; clear.className="btn btn-secondary";
    clear.onclick = async () => {
      const existing = monthlyBudgets.find(b => b.month === month && b.category === cat && b.user === bu);
      if (existing) {
        try {
          await pbDelete("monthly_budgets", existing._pbId);
          monthlyBudgets = monthlyBudgets.filter(b => b._pbId !== existing._pbId);
          renderAll();
        } catch(e) { showToast("Failed to clear override."); }
      }
    };
    tdAct.appendChild(clear);
  }

  tr.append(tdCat, tdBudget, tdSpent, tdRemain, tdAct);
  return tr;
}

function renderBudgetsTable(month) {
  budgetTableBody.innerHTML = "";
  Object.keys(categoryData).forEach(cat => {
    const budget = getEffectiveBudget(cat, month);
    const spent = monthTotal(transactions, month, cat);
    budgetTableBody.appendChild(renderBudgetRow(cat, budget, spent, month));
  });
}

// ===== Charts =====
function updateCharts(month) {
  const labels = Object.keys(categoryData);
  const budgets = labels.map(cat => getEffectiveBudget(cat, month));
  const spent = labels.map(cat => monthTotal(transactions, month, cat));
  const colors = labels.map(cat => categoryColor(cat));
  const accent1 = getComputedStyle(document.body).getPropertyValue('--accent-1').trim() || "#36a2eb";
  const accent2 = getComputedStyle(document.body).getPropertyValue('--accent-2').trim() || "#ff6384";
  const accent3 = getComputedStyle(document.body).getPropertyValue('--accent-3').trim() || "#4caf50";

  if (!budgetChart) {
    budgetChart = new Chart(budgetChartCtx, {
      type: "bar",
      data: { labels: [], datasets: [
        { label: "Budget", data: [], backgroundColor: "#36a2eb" },
        { label: "Spent",  data: [], backgroundColor: [] }
      ]},
      options: { responsive: true, plugins: { legend: { position: "top" } } }
    });
  }
  budgetChart.data.labels = labels;
  budgetChart.data.datasets[0].data = budgets;
  budgetChart.data.datasets[1].data = spent;
  budgetChart.data.datasets[1].backgroundColor = colors;
  budgetChart.update();

  if (!spendingPieChart) {
    spendingPieChart = new Chart(pieCtx, {
      type: "doughnut",
      data: { labels: [], datasets: [{ data: [], backgroundColor: [] }] },
      options: {
        plugins: {
          title: { display: true, text: "" },
          legend: { position: "bottom" }
        },
        cutout: "40%"
      }
    });
  }
  spendingPieChart.data.labels = labels;
  spendingPieChart.data.datasets[0].data = spent;
  spendingPieChart.data.datasets[0].backgroundColor = colors;
  spendingPieChart.options.plugins.title.text = `Spending Breakdown (${month})`;
  spendingPieChart.update();

  const monthIncome = monthTotal(incomeTransactions, month);
  const monthSpending = monthTotal(transactions, month);
  if (!incomeVsSpendingChart) {
    incomeVsSpendingChart = new Chart(incomeVsSpendingChartCtx, {
      type: "bar",
      data: { labels: ["Income", "Spending"], datasets: [{ label: "", data: [], backgroundColor: [] }] }
    });
  }
  incomeVsSpendingChart.data.datasets[0].label = month;
  incomeVsSpendingChart.data.datasets[0].data = [monthIncome, monthSpending];
  incomeVsSpendingChart.data.datasets[0].backgroundColor = [accent1, accent2];
  incomeVsSpendingChart.update();

  const lineMonths = monthSeq(6);
  const incomeArr = lineMonths.map(m => monthTotal(incomeTransactions, m));
  const spendArr  = lineMonths.map(m => monthTotal(transactions, m));
  const savedArr  = incomeArr.map((v, i) => v - spendArr[i]);
  if (!spendingLineChart) {
    spendingLineChart = new Chart(lineCtx, {
      type: "line",
      data: { labels: [], datasets: [
        { label: "Income",   data: [], borderColor: accent1, fill: false },
        { label: "Spending", data: [], borderColor: accent2, fill: false },
        { label: "Saved",    data: [], borderColor: accent3, fill: false }
      ]},
      options: { responsive: true }
    });
  }
  spendingLineChart.data.labels = lineMonths;
  spendingLineChart.data.datasets[0].data = incomeArr; spendingLineChart.data.datasets[0].borderColor = accent1;
  spendingLineChart.data.datasets[1].data = spendArr;  spendingLineChart.data.datasets[1].borderColor = accent2;
  spendingLineChart.data.datasets[2].data = savedArr;  spendingLineChart.data.datasets[2].borderColor = accent3;
  spendingLineChart.update();
}

// ===== Reports =====
function updateReports() {
  const monthsCount = parseInt(reportRange.value, 10);
  const focusCat = reportCategory.value || Object.keys(categoryData)[0];
  const months = monthSeq(monthsCount);

  const catTotals = months.map(m => monthTotal(transactions, m, focusCat));
  if (!categoryTotalsChart) {
    categoryTotalsChart = new Chart(categoryTotalsChartCtx, {
      type: "bar",
      data: { labels: [], datasets: [{ label: "", data: [], backgroundColor: "#ff6384" }] },
      options: { responsive: true }
    });
  }
  categoryTotalsChart.data.labels = months;
  categoryTotalsChart.data.datasets[0].label = `${focusCat} total`;
  categoryTotalsChart.data.datasets[0].data = catTotals;
  categoryTotalsChart.update();

  const subs = categoryData[focusCat] || [];
  const datasets = subs.map((sub, i) => ({
    label: sub,
    data: months.map(m => monthTotal(transactions, m, focusCat, sub)),
    borderColor: `hsl(${(i * 40) % 360},70%,50%)`,
    fill: false
  }));
  if (!subcategoryTrendChart) {
    subcategoryTrendChart = new Chart(subcategoryTrendChartCtx, {
      type: "line",
      data: { labels: [], datasets: [] },
      options: { responsive: true }
    });
  }
  subcategoryTrendChart.data.labels = months;
  subcategoryTrendChart.data.datasets = datasets;
  subcategoryTrendChart.update();

  const top = topSubcategories(transactions, currentMonth(), focusCat, 5);
  const tbody = document.getElementById("topSubcategoriesTableBody");
  tbody.innerHTML = "";
  top.forEach(([sub, amt]) => {
    const tr = document.createElement("tr");
    const tdSub = document.createElement("td"); tdSub.textContent = sub || "(Uncategorized)";
    const tdAmt = document.createElement("td"); tdAmt.textContent = fmt(amt);
    tr.append(tdSub, tdAmt);
    tbody.appendChild(tr);
  });
}

// ===== Standard Budget Form =====
document.getElementById("addStandardBudgetBtn").addEventListener("click", async () => {
  const category = standardCategorySelect.value;
  const amount = parseFloat(standardBudgetAmount.value);
  if (!category || isNaN(amount)) { showToast("Fill standard budget fields."); return; }
  const bu = budgetUser();
  const existing = standardBudgets.find(b => b.category === category && b.user === bu);
  try {
    if (existing) {
      await pbUpdate("standard_budgets", existing._pbId, { amount });
      existing.amount = amount;
    } else {
      const rec = await pbCreate("standard_budgets", { user: bu, category, amount });
      standardBudgets.push({ _pbId: rec.id, user: bu, category, amount });
    }
    renderAll();
  } catch(e) { showToast("Failed to save budget."); }
});

// ===== Category Management =====
document.getElementById("addCategoryBtn").addEventListener("click", async () => {
  const name = document.getElementById("newCategoryName").value.trim();
  if (!name) return;
  if (categoryData[name]) { showToast("Category already exists."); return; }
  try {
    const rec = await pbCreate("category_data", { name, subcategories: [] });
    categoryData[name] = [];
    categoryMeta[name] = rec.id;
    document.getElementById("newCategoryName").value = "";
    populateCategories(); renderAll();
  } catch(e) { showToast("Failed to add category."); }
});

document.getElementById("addSubcategoryBtn").addEventListener("click", async () => {
  const cat = subcategoryCategorySelect.value;
  const sub = document.getElementById("newSubcategoryName").value.trim();
  if (!cat || !sub) return;
  if (categoryData[cat].includes(sub)) { showToast("Subcategory already exists."); return; }
  categoryData[cat].push(sub);
  try {
    await pbUpdate("category_data", categoryMeta[cat], { subcategories: categoryData[cat] });
    document.getElementById("newSubcategoryName").value = "";
    populateCategories(); renderAll();
  } catch(e) { categoryData[cat].pop(); showToast("Failed to add subcategory."); }
});

// Categories are shared by every user, so removal has to account for every user's
// records — not just the ones loaded for the current view.
document.getElementById("removeCategoryBtn").addEventListener("click", async () => {
  const cat = removeCategorySelect.value;
  if (!cat) return;
  let plan;
  try {
    const [allTx, allStandard, allMonthly] = await Promise.all([
      pbList("transactions"), pbList("standard_budgets"), pbList("monthly_budgets")
    ]);
    plan = categoryRemovalPlan(cat, { transactions: allTx, standardBudgets: allStandard, monthlyBudgets: allMonthly });
  } catch(e) { showToast("Could not check what uses this category."); return; }

  if (!confirm(describeCategoryRemoval(plan, userLabel))) return;
  try {
    await Promise.all([
      ...plan.transactions.map(t => pbDelete("transactions", t.id)),
      ...plan.budgets.map(b => pbDelete(b.collection, b.id))
    ]);
    await pbDelete("category_data", categoryMeta[cat]);
  } catch(e) {
    showToast("Failed to remove category. Some records may have been deleted; reloading.");
  }
  await loadData();
  populateCategories(); renderAll();
});

document.getElementById("removeSubcategoryBtn").addEventListener("click", async () => {
  const cat = removeSubcategoryCategorySelect.value;
  const sub = removeSubcategorySelect.value;
  if (confirm(`Remove subcategory "${sub}" from category "${cat}"?`)) {
    const prev = [...categoryData[cat]];
    categoryData[cat] = categoryData[cat].filter(s => s !== sub);
    try {
      await pbUpdate("category_data", categoryMeta[cat], { subcategories: categoryData[cat] });
      populateCategories(); renderAll();
    } catch(e) { categoryData[cat] = prev; showToast("Failed to remove subcategory."); }
  }
});

// ===== Backup =====
document.getElementById("exportDataBtn").addEventListener("click", () => {
  const clean = arr => arr.map(({ _pbId, ...rest }) => rest);
  const data = {
    transactions: clean(transactions),
    incomeTransactions: clean(incomeTransactions),
    standardBudgets: clean(standardBudgets),
    monthlyBudgets: clean(monthlyBudgets),
    categoryData
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "budget_data.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

// ===== CSV Export =====
document.getElementById("exportCsvBtn").addEventListener("click", () => {
  const blob = new Blob([transactionsToCSV(transactions)], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "transactions.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

// ===== Apply Recurring =====
document.getElementById("applyRecurringBtn").addEventListener("click", async () => {
  if (activeUser === "all") { showToast("Select a specific user to apply recurring.", "info"); return; }
  const month = currentMonth();
  const prevMonth = addMonths(parseMonth(month), -1);
  const hasRecurring = transactions.some(t => t.user === activeUser && t.recurring && t.date.startsWith(prevMonth));
  if (!hasRecurring) {
    showToast("No recurring transactions found in the previous month.", "info");
    return;
  }

  const toAdd = recurringToCopy(transactions, month, activeUser);
  if (toAdd.length === 0) {
    showToast("All recurring transactions already exist for this month.", "info");
    return;
  }

  try {
    const created = await Promise.all(toAdd.map(t => pbCreate("transactions", t)));
    created.forEach(rec => {
      transactions.push({ _pbId: rec.id, user: activeUser, date: rec.date, category: rec.category, subcategory: rec.subcategory, description: rec.description, amount: rec.amount, recurring: true });
    });
    renderAll();
    showToast(`Added ${toAdd.length} recurring transaction(s) for ${month}.`, "success");
  } catch(e) { showToast("Failed to add recurring transactions."); }
});

// ===== Dark Mode =====
function applyChartTheme() {
  const isDark = document.body.classList.contains("dark-mode");
  Chart.defaults.color = isDark ? "#e0e0e0" : "#666";
}
function destroyAllCharts() {
  [budgetChart, spendingPieChart, spendingLineChart, incomeVsSpendingChart,
   categoryTotalsChart, subcategoryTrendChart, savingsChart].forEach(c => { if (c) c.destroy(); });
  budgetChart = spendingPieChart = spendingLineChart = incomeVsSpendingChart =
    categoryTotalsChart = subcategoryTrendChart = savingsChart = null;
}

const darkToggle = document.getElementById("darkModeToggle");
darkToggle.addEventListener("click", () => {
  document.body.classList.toggle("dark-mode");
  localStorage.setItem(STORAGE_PREFIX + "darkMode", document.body.classList.contains("dark-mode"));
  applyChartTheme();
  destroyAllCharts();
  updateCharts(currentMonth());
  updateReports();
  updateSavingsTracker();
});
(function initDarkMode() {
  const stored = localStorage.getItem(STORAGE_PREFIX + "darkMode");
  if (stored === "true") document.body.classList.add("dark-mode");
  else if (stored === "false") document.body.classList.remove("dark-mode");
  else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    document.body.classList.add("dark-mode");
  }
  applyChartTheme();
})();

let savingsChart;

function updateSavingsTracker() {
  const rows = savingsRows(incomeTransactions, transactions);
  const months = rows.map(r => r.month);
  const cumulatives = rows.map(r => r.cumulative);

  const tableBody = document.getElementById("savingsTableBody");
  tableBody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");
    [r.month, fmt(r.income), fmt(r.spending), fmt(r.net), fmt(r.cumulative)].forEach(text => {
      const td = document.createElement("td"); td.textContent = text; tr.appendChild(td);
    });
    tableBody.appendChild(tr);
  });

  if (!savingsChart) {
    const ctx = document.getElementById("savingsChart").getContext("2d");
    savingsChart = new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [{ label: "Cumulative Savings", data: [], borderColor: "#4caf50", fill: false }] }
    });
  }
  savingsChart.data.labels = months;
  savingsChart.data.datasets[0].data = cumulatives;
  savingsChart.update();
}

// ===== Render everything =====
function renderAll() {
  const month = currentMonth();
  monthSelector.value = month;

  renderTransactionsTable(month);
  renderIncomeTable(month);
  renderBudgetsTable(month);
  updateCharts(month);
  updateReports();
  updateSavingsTracker();

  const income = monthTotal(incomeTransactions, month);
  const spending = monthTotal(transactions, month);
  const balance = income - spending;
  document.getElementById("summaryIncome").textContent = fmt(income);
  document.getElementById("summarySpending").textContent = fmt(spending);
  const balanceEl = document.getElementById("summaryBalanceAmount");
  balanceEl.textContent = (balance < 0 ? "-$" : "$") + fmt(Math.abs(balance));
  balanceEl.classList.remove("balance-positive", "balance-negative");
  if (balance > 0) balanceEl.classList.add("balance-positive");
  else if (balance < 0) balanceEl.classList.add("balance-negative");
}

// ===== Init =====
if (!monthSelector.value) monthSelector.value = monthKey(new Date());
monthSelector.addEventListener("change", () => { renderAll(); });
reportRange.addEventListener("change", updateReports);
reportCategory.addEventListener("change", updateReports);
let txSearchDebounce;
document.getElementById("txSearch").addEventListener("input", e => {
  txFilter = e.target.value.trim();
  clearTimeout(txSearchDebounce);
  txSearchDebounce = setTimeout(() => renderTransactionsTable(currentMonth()), 150);
});

const activeUserSelect = document.getElementById("activeUserSelect");
USERS.forEach(u => activeUserSelect.add(new Option(u.label, u.id)));
activeUserSelect.add(new Option("All", "all"));
activeUserSelect.value = activeUser;
activeUserSelect.addEventListener("change", async () => {
  activeUser = activeUserSelect.value;
  localStorage.setItem(STORAGE_PREFIX + "activeUser", activeUser);
  await loadData();
  populateCategories();
  destroyAllCharts();
  renderAll();
});

(async () => {
  await loadData();
  populateCategories();
  renderAll();
})();
