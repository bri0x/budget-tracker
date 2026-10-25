import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createMemoryApi } from "../pb_public/js/api.js";
import { generateDemoData, DEMO_USERS, DEMO_CATEGORIES } from "../pb_public/js/demo-data.js";
import { dateKey, monthKey, addMonths, monthTotal, effectiveBudget, budgetStatus, recurringToCopy } from "../pb_public/js/lib.js";
import { readFileSync, readdirSync } from "node:fs";

describe("memory api", () => {
  test("create / list / update / remove", async () => {
    const api = createMemoryApi({ things: [{ id: "x1", n: 1 }] });
    const created = await api.create("things", { n: 2 });
    assert.ok(created.id && created.id !== "x1");
    assert.equal((await api.list("things")).length, 2);

    await api.update("things", created.id, { n: 3 });
    assert.equal((await api.list("things")).find(r => r.id === created.id).n, 3);

    await api.remove("things", "x1");
    assert.deepEqual((await api.list("things")).map(r => r.n), [3]);
  });
  test("returns copies, so callers can't mutate the store by accident", async () => {
    const api = createMemoryApi({ things: [{ id: "a", tags: ["x"] }] });
    (await api.list("things"))[0].tags.push("y");
    assert.deepEqual((await api.list("things"))[0].tags, ["x"]);
  });
  test("unknown ids fail like a 404", async () => {
    const api = createMemoryApi();
    await assert.rejects(api.update("things", "nope", {}), /404/);
    await assert.rejects(api.remove("things", "nope"), /404/);
  });
  test("unknown collections list as empty", async () => {
    assert.deepEqual(await createMemoryApi().list("nothing"), []);
  });
});

describe("demo data", () => {
  const now = new Date(2026, 9, 24, 12, 0);
  const data = generateDemoData(now);

  test("is deterministic", () => {
    assert.deepEqual(generateDemoData(now), data);
  });
  test("covers the last 7 months and nothing after today", () => {
    const months = new Set(data.transactions.map(t => t.date.slice(0, 7)));
    assert.equal(months.size, 7);
    assert.ok(months.has(addMonths(now, -6)) && months.has(monthKey(now)));
    assert.ok([...data.transactions, ...data.income].every(r => r.date <= dateKey(now)));
  });
  test("every record uses a demo user and an existing category/subcategory", () => {
    const users = new Set(DEMO_USERS.map(u => u.id));
    for (const t of data.transactions) {
      assert.ok(users.has(t.user), t.user);
      assert.ok(DEMO_CATEGORIES[t.category]?.includes(t.subcategory), `${t.category}/${t.subcategory}`);
      assert.match(t.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(t.amount > 0);
    }
    for (const b of data.standard_budgets) assert.ok(DEMO_CATEGORIES[b.category], b.category);
  });
  test("shows off the interesting states: an over-budget month and a monthly override", () => {
    const users = DEMO_USERS.map(u => u.id);
    const over = Object.keys(DEMO_CATEGORIES).some(cat =>
      [0, 1, 2, 3, 4, 5, 6].some(i => {
        const m = addMonths(now, -i);
        const b = effectiveBudget(cat, m, users, data.standard_budgets, data.monthly_budgets);
        return b > 0 && budgetStatus(b, monthTotal(data.transactions, m, cat)).className === "over-budget";
      }));
    assert.ok(over, "expected at least one over-budget category-month");
    assert.equal(data.monthly_budgets.length, 1);
  });
  test("mid-month, 'Apply Recurring' has entries left to copy", () => {
    // Recurring entries due later this month haven't happened yet, so they can be copied.
    const midMonth = new Date(2026, 9, 10, 12, 0);
    const d = generateDemoData(midMonth);
    assert.ok(recurringToCopy(d.transactions, monthKey(midMonth), "sam").length > 0);
  });
  test("categories match the starter-categories migration", () => {
    const dir = new URL("../pb_migrations/", import.meta.url);
    const file = readdirSync(dir).find(f => f.endsWith("_seed_starter_categories.js"));
    const src = readFileSync(new URL(file, dir), "utf8");
    const seeded = new Function(`${src.match(/const STARTER_CATEGORIES = (\{[\s\S]*?\});/)[0]} return STARTER_CATEGORIES;`)();
    assert.deepEqual(seeded, DEMO_CATEGORIES);
  });
});
