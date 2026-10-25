// Pure logic: no DOM, no network. Everything here is covered by test/lib.test.js.
//
// Dates are stored as strings: "YYYY-MM-DD" for records, "YYYY-MM" for months.
// Month math always uses local time — never toISOString(), which converts to UTC
// and shifts the month near month boundaries depending on time zone.

// ===== Formatting =====
export function fmt(n) {
  const num = (n === null || n === undefined || isNaN(n)) ? 0 : Number(n);
  return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ===== Dates =====
const pad2 = n => String(n).padStart(2, "0");

/** "YYYY-MM" for a Date, in local time. */
export function monthKey(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }

/** "YYYY-MM-DD" for a Date, in local time. */
export function dateKey(d) { return `${monthKey(d)}-${pad2(d.getDate())}`; }

/** The month n months after (or before, if negative) the month containing d, as "YYYY-MM". */
export function addMonths(d, n) { return monthKey(new Date(d.getFullYear(), d.getMonth() + n, 1)); }

/** Parse "YYYY-MM" into a local Date on the 1st of that month. */
export function parseMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** The last n months ending with the month containing `now`, oldest first. */
export function monthSeq(n, now = new Date()) {
  const arr = [];
  for (let i = n - 1; i >= 0; i--) arr.push(addMonths(now, -i));
  return arr;
}

/** Every month from `first` through `last` inclusive ("YYYY-MM" strings). */
export function monthRange(first, last) {
  const months = [];
  const start = parseMonth(first);
  for (let i = 0; ; i++) {
    const m = addMonths(start, i);
    if (m > last) break;
    months.push(m);
  }
  return months;
}

// ===== Totals =====
/** Sum of `amount` for records dated in `month`, optionally limited to one category / subcategory. */
export function monthTotal(records, month, category, subcategory) {
  return records
    .filter(r => r.date && r.date.startsWith(month) &&
      (category === undefined || r.category === category) &&
      (subcategory === undefined || r.subcategory === subcategory))
    .reduce((s, r) => s + r.amount, 0);
}

/** Distinct user ids appearing in any of the given record lists. */
export function usersIn(...lists) {
  const s = new Set();
  lists.flat().forEach(r => { if (r.user) s.add(r.user); });
  return [...s];
}

/**
 * Budget for a category in a month, summed over `users`. A user's monthly
 * override wins over their standard budget; no budget at all counts as 0.
 */
export function effectiveBudget(category, month, users, standardBudgets, monthlyBudgets) {
  return users.reduce((total, u) => {
    const override = monthlyBudgets.find(b => b.month === month && b.category === category && b.user === u)?.amount;
    const standard = standardBudgets.find(b => b.category === category && b.user === u)?.amount ?? 0;
    return total + (override ?? standard);
  }, 0);
}

/** Display state for a budget row: CSS class, progress-bar percent (or null) and bar color. */
export function budgetStatus(budget, spent) {
  const remaining = budget - spent;
  const className = remaining < 0 ? "over-budget" : remaining === 0 ? "on-budget" : "under-budget";
  if (!(budget > 0)) return { remaining, className, pct: null, barColor: null };
  const pct = Math.min(100, (spent / budget) * 100);
  const barColor = pct >= 100 ? "#dc3545" : pct >= 80 ? "#ffc107" : "#28a745";
  return { remaining, className, pct, barColor };
}

/** Monthly income, spending, net and running total from the earliest record through `now`'s month. */
export function savingsRows(income, transactions, now = new Date()) {
  const thisMonth = monthKey(now);
  const earliest = [...transactions, ...income]
    .map(x => (x.date || "").slice(0, 7))
    .filter(m => /^\d{4}-\d{2}$/.test(m))
    .sort()[0] || thisMonth;

  let cumulative = 0;
  return monthRange(earliest, thisMonth).map(month => {
    const inc = monthTotal(income, month);
    const spending = monthTotal(transactions, month);
    const net = inc - spending;
    cumulative += net;
    return { month, income: inc, spending, net, cumulative };
  });
}

/** Top n subcategories by spend for a category in a month: [[subcategory, amount], ...]. */
export function topSubcategories(transactions, month, category, n = 5) {
  const totals = {};
  transactions
    .filter(t => t.date && t.date.startsWith(month) && t.category === category)
    .forEach(t => { totals[t.subcategory] = (totals[t.subcategory] || 0) + t.amount; });
  return Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, n);
}

// ===== Search =====
export function txMatchesFilter(t, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return (t.date || "").includes(q) ||
    (t.category || "").toLowerCase().includes(q) ||
    (t.subcategory || "").toLowerCase().includes(q) ||
    (t.description || "").toLowerCase().includes(q);
}

// ===== Colors =====
const CATEGORY_COLORS = {
  "Food": "#FF6384",
  "Transport": "#36A2EB",
  "Bills": "#FFCE56",
  "Entertainment": "#4BC0C0",
  "Other": "#9966FF"
};

/** Fixed color for well-known categories, otherwise a stable hue derived from the name. */
export function categoryColor(category) {
  if (CATEGORY_COLORS[category]) return CATEGORY_COLORS[category];
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = (category.charCodeAt(i) + ((hash << 5) - hash)) | 0;
  }
  return `hsl(${((hash % 360) + 360) % 360}, 70%, 50%)`;
}

// ===== Recurring =====
/**
 * Recurring transactions from the month before `month` that should be copied into `month` for `user`.
 * Days past the end of a shorter month are clamped (Jan 31 -> Feb 28/29). Entries that already have a
 * recurring match (same category, subcategory and amount) in `month` are skipped, so it's safe to re-run.
 */
export function recurringToCopy(transactions, month, user) {
  const target = parseMonth(month);
  const prevMonth = addMonths(target, -1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();

  return transactions
    .filter(t => t.user === user && t.recurring && t.date && t.date.startsWith(prevMonth))
    .filter(t => !transactions.some(e =>
      e.user === user && e.recurring && e.date && e.date.startsWith(month) &&
      e.category === t.category && e.subcategory === t.subcategory && e.amount === t.amount))
    .map(t => {
      const day = Math.min(parseInt(t.date.slice(8), 10), lastDay);
      return {
        user, date: `${month}-${pad2(day)}`, category: t.category, subcategory: t.subcategory,
        description: t.description, amount: t.amount, recurring: true
      };
    });
}

// ===== Category removal =====
/**
 * Everything that removing a category deletes. Categories are shared by all users, so this
 * must be computed from every user's records, not just the ones currently on screen.
 */
export function categoryRemovalPlan(category, { transactions, standardBudgets, monthlyBudgets }) {
  const tx = transactions.filter(t => t.category === category);
  const budgets = [
    ...standardBudgets.filter(b => b.category === category).map(b => ({ collection: "standard_budgets", ...b })),
    ...monthlyBudgets.filter(b => b.category === category).map(b => ({ collection: "monthly_budgets", ...b }))
  ];
  const txByUser = {};
  tx.forEach(t => { txByUser[t.user] = (txByUser[t.user] || 0) + 1; });
  return { category, transactions: tx, budgets, txByUser };
}

/** Confirmation text for a removal plan. `labelFor(userId)` returns a display name. */
export function describeCategoryRemoval(plan, labelFor = id => id) {
  const lines = [`Remove category "${plan.category}" for everyone?`];
  const n = plan.transactions.length;
  if (n > 0) {
    const perUser = Object.entries(plan.txByUser)
      .map(([u, c]) => `${labelFor(u)}: ${c}`).join(", ");
    lines.push(`This permanently deletes ${n} transaction${n === 1 ? "" : "s"} (${perUser}).`);
  }
  if (plan.budgets.length > 0) {
    lines.push(`It also deletes ${plan.budgets.length} budget entr${plan.budgets.length === 1 ? "y" : "ies"} for this category.`);
  }
  if (n === 0 && plan.budgets.length === 0) lines.push("No transactions or budgets use it.");
  return lines.join("\n");
}

// ===== Export =====
export function toCSVField(val) {
  const s = String(val ?? "");
  return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function transactionsToCSV(transactions) {
  const headers = ["Date", "Category", "Subcategory", "Description", "Amount", "Recurring", "User"];
  const rows = transactions.map(t => [
    t.date, t.category, t.subcategory, t.description || "",
    t.amount.toFixed(2), t.recurring ? "Yes" : "No", t.user || ""
  ].map(toCSVField).join(","));
  return [headers.join(","), ...rows].join("\n");
}
