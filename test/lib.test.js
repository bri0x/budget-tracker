import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  fmt, monthKey, dateKey, addMonths, parseMonth, monthSeq, monthRange, monthTotal, usersIn,
  effectiveBudget, budgetStatus, savingsRows, topSubcategories, txMatchesFilter, categoryColor,
  recurringToCopy, categoryRemovalPlan, describeCategoryRemoval, toCSVField, transactionsToCSV
} from "../pb_public/js/lib.js";

const tx = (date, amount, extra = {}) => ({ user: "a", date, amount, category: "Food", subcategory: "Groceries", ...extra });

describe("fmt", () => {
  test("two decimals with thousands separators", () => {
    assert.equal(fmt(1234.5), "1,234.50");
    assert.equal(fmt(0), "0.00");
    assert.equal(fmt(-3.456), "-3.46");
  });
  test("bad input renders as 0.00", () => {
    for (const v of [NaN, undefined, null, "abc"]) assert.equal(fmt(v), "0.00");
  });
});

describe("month helpers", () => {
  test("monthKey / dateKey use local date parts", () => {
    assert.equal(monthKey(new Date(2026, 0, 31, 23, 59)), "2026-01");
    assert.equal(dateKey(new Date(2026, 8, 1, 0, 0)), "2026-09-01");
  });
  test("addMonths crosses year boundaries and ignores the day of month", () => {
    assert.equal(addMonths(new Date(2026, 0, 31), -1), "2025-12");
    assert.equal(addMonths(new Date(2026, 0, 31), 1), "2026-02");
    assert.equal(addMonths(new Date(2025, 11, 15), 1), "2026-01");
    assert.equal(addMonths(new Date(2026, 4, 1), -12), "2025-05");
  });
  test("parseMonth round-trips", () => {
    assert.equal(monthKey(parseMonth("2026-03")), "2026-03");
    assert.equal(parseMonth("2026-03").getDate(), 1);
  });
  test("monthSeq returns the last n months, oldest first", () => {
    assert.deepEqual(monthSeq(3, new Date(2026, 1, 10)), ["2025-12", "2026-01", "2026-02"]);
    assert.deepEqual(monthSeq(1, new Date(2026, 1, 10)), ["2026-02"]);
  });
  test("monthRange is inclusive", () => {
    assert.deepEqual(monthRange("2025-11", "2026-02"), ["2025-11", "2025-12", "2026-01", "2026-02"]);
    assert.deepEqual(monthRange("2026-02", "2026-02"), ["2026-02"]);
    assert.deepEqual(monthRange("2026-03", "2026-02"), []);
  });
});

describe("totals", () => {
  const records = [
    tx("2026-03-01", 10), tx("2026-03-31", 5, { subcategory: "Coffee" }),
    tx("2026-03-15", 100, { category: "Bills", subcategory: "Water" }), tx("2026-04-01", 999)
  ];
  test("monthTotal filters by month, category and subcategory", () => {
    assert.equal(monthTotal(records, "2026-03"), 115);
    assert.equal(monthTotal(records, "2026-03", "Food"), 15);
    assert.equal(monthTotal(records, "2026-03", "Food", "Coffee"), 5);
    assert.equal(monthTotal(records, "2026-05"), 0);
  });
  test("monthTotal skips records without a date", () => {
    assert.equal(monthTotal([{ amount: 5 }, tx("2026-03-02", 1)], "2026-03"), 1);
  });
  test("usersIn collects distinct users across lists", () => {
    assert.deepEqual(usersIn([{ user: "a" }, { user: "b" }], [{ user: "a" }, {}]).sort(), ["a", "b"]);
  });
});

describe("effectiveBudget", () => {
  const standard = [{ user: "a", category: "Food", amount: 300 }, { user: "b", category: "Food", amount: 200 }];
  const monthly = [{ user: "a", month: "2026-03", category: "Food", amount: 500 }];
  test("monthly override beats standard budget", () => {
    assert.equal(effectiveBudget("Food", "2026-03", ["a"], standard, monthly), 500);
    assert.equal(effectiveBudget("Food", "2026-04", ["a"], standard, monthly), 300);
  });
  test("sums across users, each with their own override or standard", () => {
    assert.equal(effectiveBudget("Food", "2026-03", ["a", "b"], standard, monthly), 700);
  });
  test("no budget counts as zero", () => {
    assert.equal(effectiveBudget("Travel", "2026-03", ["a", "b"], standard, monthly), 0);
  });
  test("an explicit override of 0 is respected", () => {
    assert.equal(effectiveBudget("Food", "2026-03", ["a"], standard, [{ user: "a", month: "2026-03", category: "Food", amount: 0 }]), 0);
  });
});

describe("budgetStatus", () => {
  test("under / on / over", () => {
    assert.equal(budgetStatus(100, 50).className, "under-budget");
    assert.equal(budgetStatus(100, 100).className, "on-budget");
    assert.equal(budgetStatus(100, 150).className, "over-budget");
  });
  test("progress bar thresholds and cap", () => {
    assert.deepEqual([budgetStatus(100, 50).pct, budgetStatus(100, 50).barColor], [50, "#28a745"]);
    assert.equal(budgetStatus(100, 80).barColor, "#ffc107");
    assert.deepEqual([budgetStatus(100, 250).pct, budgetStatus(100, 250).barColor], [100, "#dc3545"]);
  });
  test("no bar without a budget", () => {
    assert.equal(budgetStatus(0, 20).pct, null);
    assert.equal(budgetStatus(0, 20).remaining, -20);
  });
});

describe("savingsRows", () => {
  test("runs from earliest record through the current month with a running total", () => {
    const income = [{ date: "2026-01-15", amount: 1000 }];
    const spend = [tx("2026-01-03", 400), tx("2026-03-10", 100)];
    const rows = savingsRows(income, spend, new Date(2026, 2, 20));
    assert.deepEqual(rows.map(r => r.month), ["2026-01", "2026-02", "2026-03"]);
    assert.deepEqual(rows.map(r => r.net), [600, 0, -100]);
    assert.deepEqual(rows.map(r => r.cumulative), [600, 600, 500]);
  });
  test("a record on the 1st starts that month, not the one before (time-zone regression)", () => {
    const rows = savingsRows([], [tx("2025-09-01", 5)], new Date(2025, 9, 5));
    assert.equal(rows[0].month, "2025-09");
  });
  test("no data -> just the current month", () => {
    assert.deepEqual(savingsRows([], [], new Date(2026, 6, 4)).map(r => r.month), ["2026-07"]);
  });
});

describe("topSubcategories", () => {
  test("sorted by spend and limited to n", () => {
    const list = [
      tx("2026-03-01", 10, { subcategory: "A" }), tx("2026-03-02", 30, { subcategory: "B" }),
      tx("2026-03-03", 25, { subcategory: "A" }), tx("2026-03-04", 1, { subcategory: "C" }),
      tx("2026-04-01", 999, { subcategory: "C" })
    ];
    assert.deepEqual(topSubcategories(list, "2026-03", "Food", 2), [["A", 35], ["B", 30]]);
  });
});

describe("txMatchesFilter", () => {
  const t = tx("2026-03-04", 12, { description: "Corner Market" });
  test("matches date, category, subcategory and description case-insensitively", () => {
    for (const q of ["2026-03", "food", "GROCER", "corner"]) assert.ok(txMatchesFilter(t, q), q);
    assert.ok(!txMatchesFilter(t, "rent"));
    assert.ok(txMatchesFilter(t, ""));
  });
});

describe("categoryColor", () => {
  test("known categories get fixed colors", () => assert.equal(categoryColor("Food"), "#FF6384"));
  test("other names get a stable, valid hue", () => {
    const c = categoryColor("Some Very Long Category Name That Overflows The Hash");
    assert.equal(c, categoryColor("Some Very Long Category Name That Overflows The Hash"));
    const hue = Number(c.match(/^hsl\((\d+), 70%, 50%\)$/)[1]);
    assert.ok(hue >= 0 && hue < 360);
  });
});

describe("recurringToCopy", () => {
  const base = [
    tx("2026-01-31", 50, { recurring: true, description: "Gym" }),
    tx("2026-01-15", 9.99, { recurring: true, category: "Entertainment", subcategory: "Streaming" }),
    tx("2026-01-20", 70, { recurring: false }),
    tx("2026-01-10", 30, { recurring: true, user: "b" })
  ];
  test("copies the previous month's recurring entries for that user only", () => {
    const out = recurringToCopy(base, "2026-02", "a");
    assert.equal(out.length, 2);
    assert.ok(out.every(t => t.user === "a" && t.recurring === true));
  });
  test("clamps days that don't exist in the target month", () => {
    const out = recurringToCopy(base, "2026-02", "a");
    assert.equal(out.find(t => t.description === "Gym").date, "2026-02-28");
    assert.equal(recurringToCopy([tx("2028-01-31", 1, { recurring: true })], "2028-02", "a")[0].date, "2028-02-29");
  });
  test("skips entries already copied, so re-running is safe", () => {
    const already = [...base, tx("2026-02-27", 50, { recurring: true })];
    assert.equal(recurringToCopy(already, "2026-02", "a").length, 1);
  });
  test("works across the year boundary", () => {
    assert.equal(recurringToCopy([tx("2025-12-05", 1, { recurring: true })], "2026-01", "a")[0].date, "2026-01-05");
  });
});

describe("category removal", () => {
  const data = {
    transactions: [
      tx("2026-03-01", 1, { id: "t1", user: "a" }), tx("2026-03-02", 2, { id: "t2", user: "b" }),
      tx("2026-03-03", 3, { id: "t3", user: "b" }), tx("2026-03-04", 4, { id: "t4", category: "Bills" })
    ],
    standardBudgets: [{ id: "s1", user: "a", category: "Food", amount: 1 }, { id: "s2", user: "a", category: "Bills", amount: 1 }],
    monthlyBudgets: [{ id: "m1", user: "b", month: "2026-03", category: "Food", amount: 1 }]
  };
  test("plan includes every user's transactions and budgets for the category", () => {
    const plan = categoryRemovalPlan("Food", data);
    assert.deepEqual(plan.transactions.map(t => t.id), ["t1", "t2", "t3"]);
    assert.deepEqual(plan.budgets.map(b => `${b.collection}/${b.id}`), ["standard_budgets/s1", "monthly_budgets/m1"]);
    assert.deepEqual(plan.txByUser, { a: 1, b: 2 });
  });
  test("confirmation text spells out what gets deleted, per user", () => {
    const msg = describeCategoryRemoval(categoryRemovalPlan("Food", data), id => id.toUpperCase());
    assert.match(msg, /for everyone/);
    assert.match(msg, /3 transactions \(A: 1, B: 2\)/);
    assert.match(msg, /2 budget entries/);
  });
  test("unused category says so", () => {
    const msg = describeCategoryRemoval(categoryRemovalPlan("Travel", data));
    assert.match(msg, /No transactions or budgets use it/);
  });
});

describe("CSV export", () => {
  test("quotes fields with commas, quotes or newlines", () => {
    assert.equal(toCSVField("plain"), "plain");
    assert.equal(toCSVField('a,b'), '"a,b"');
    assert.equal(toCSVField('say "hi"'), '"say ""hi"""');
    assert.equal(toCSVField("two\nlines"), '"two\nlines"');
    assert.equal(toCSVField(null), "");
  });
  test("header plus one row per transaction", () => {
    const csv = transactionsToCSV([tx("2026-03-01", 12.5, { description: "Milk, eggs", recurring: true })]);
    assert.equal(csv, 'Date,Category,Subcategory,Description,Amount,Recurring,User\n2026-03-01,Food,Groceries,"Milk, eggs",12.50,Yes,a');
  });
});
