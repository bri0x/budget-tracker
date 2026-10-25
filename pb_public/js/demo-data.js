// Fake household for demo mode (open the app with ?demo). Deterministic: the same
// seed gives the same data, always dated relative to `now` so the demo never goes stale.
import { addMonths, dateKey, parseMonth } from "./lib.js";

export const DEMO_USERS = [
  { id: "alex", label: "Alex", color: "#36a2eb" },
  { id: "sam",  label: "Sam",  color: "#e44d7b" }
];

// Same set a fresh install is seeded with (pb_migrations/*_seed_starter_categories.js).
export const DEMO_CATEGORIES = {
  "Housing":       ["Rent/Mortgage", "Maintenance", "Supplies"],
  "Bills":         ["Electricity", "Water", "Internet", "Phone", "Insurance"],
  "Food":          ["Groceries", "Dining Out", "Coffee"],
  "Transport":     ["Gas", "Public Transit", "Parking", "Car Maintenance"],
  "Health":        ["Doctor", "Pharmacy", "Fitness"],
  "Entertainment": ["Streaming", "Events", "Hobbies"],
  "Other":         ["Gifts", "Clothing", "Miscellaneous"]
};

// Small seeded PRNG (mulberry32) so the demo is reproducible.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fixed monthly entries: [user, day, category, subcategory, description, amount]
const RECURRING = [
  ["alex",  1, "Housing", "Rent/Mortgage", "Rent", 1450],
  ["alex",  3, "Health", "Fitness", "Gym membership", 39.99],
  ["sam",   8, "Entertainment", "Streaming", "Streaming bundle", 22.99],
  ["sam",  12, "Bills", "Internet", "Fiber internet", 65],
  ["alex", 18, "Bills", "Phone", "Phone plan", 45],
  ["sam",  22, "Bills", "Insurance", "Car insurance", 112.5]
];

// Variable spending: [user, category, subcategory, description, timesPerMonth, min, max]
const VARIABLE = [
  ["alex", "Food", "Groceries", "Grocery store", 4, 55, 140],
  ["sam",  "Food", "Groceries", "Farmers market", 2, 20, 45],
  ["sam",  "Food", "Dining Out", "Dinner out", 3, 28, 85],
  ["alex", "Food", "Coffee", "Coffee shop", 6, 4.5, 7.5],
  ["alex", "Transport", "Gas", "Gas station", 3, 38, 62],
  ["sam",  "Transport", "Public Transit", "Transit card", 1, 40, 40],
  ["alex", "Bills", "Electricity", "Electric bill", 1, 70, 135],
  ["sam",  "Entertainment", "Events", "Concert / movie", 1, 25, 120],
  ["sam",  "Other", "Clothing", "Clothing", 1, 30, 150],
  ["alex", "Health", "Pharmacy", "Pharmacy", 1, 8, 35]
];

const STANDARD_BUDGETS = {
  alex: { "Housing": 1500, "Bills": 220, "Food": 550, "Transport": 180, "Health": 70 },
  sam:  { "Bills": 200, "Food": 300, "Transport": 60, "Entertainment": 120, "Other": 100 }
};

const round2 = n => Math.round(n * 100) / 100;

/** Build demo records for every collection, covering the last `months` months through today. */
export function generateDemoData(now = new Date(), { months = 7, seed = 42 } = {}) {
  const rand = rng(seed);
  const today = dateKey(now);
  const transactions = [], income = [], monthly_budgets = [];

  for (let i = months - 1; i >= 0; i--) {
    const month = addMonths(now, -i);
    const start = parseMonth(month);
    const daysInMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    const day = d => `${month}-${String(Math.min(d, daysInMonth)).padStart(2, "0")}`;
    const add = (list, rec) => { if (rec.date <= today) list.push(rec); };

    // Income: Alex paid on the 1st and 15th, Sam on the 5th and 20th, plus occasional freelance.
    add(income, { user: "alex", date: day(1),  source: "Paycheck", amount: 2450 });
    add(income, { user: "alex", date: day(15), source: "Paycheck", amount: 2450 });
    add(income, { user: "sam",  date: day(5),  source: "Paycheck", amount: 1900 });
    add(income, { user: "sam",  date: day(20), source: "Paycheck", amount: 1900 });
    if (rand() < 0.4) add(income, { user: "sam", date: day(10 + Math.floor(rand() * 15)), source: "Freelance", amount: round2(150 + rand() * 450) });

    for (const [user, d, category, subcategory, description, amount] of RECURRING) {
      add(transactions, { user, date: day(d), category, subcategory, description, amount, recurring: true });
    }
    for (const [user, category, subcategory, description, times, min, max] of VARIABLE) {
      for (let k = 0; k < times; k++) {
        const d = 1 + Math.floor(rand() * daysInMonth);
        add(transactions, { user, date: day(d), category, subcategory, description, amount: round2(min + rand() * (max - min)), recurring: false });
      }
    }

    // Splurges so the budget table shows over-budget rows: one in the default view
    // (Alex, current month — day 1 is never in the future) and one a few months back.
    if (i === 0) add(transactions, { user: "alex", date: day(1), category: "Health", subcategory: "Doctor", description: "Dentist visit", amount: 185 });
    if (i === 2) add(transactions, { user: "sam", date: day(14), category: "Entertainment", subcategory: "Hobbies", description: "New guitar", amount: 389 });
    // One irregular expense to show up in the trends.
    if (i === 4) add(transactions, { user: "alex", date: day(9), category: "Transport", subcategory: "Car Maintenance", description: "Brakes", amount: 420 });
    // A holiday-style monthly override on Alex's food budget last month.
    if (i === 1) monthly_budgets.push({ user: "alex", month, category: "Food", amount: 700 });
  }

  const standard_budgets = Object.entries(STANDARD_BUDGETS).flatMap(([user, cats]) =>
    Object.entries(cats).map(([category, amount]) => ({ user, category, amount })));
  const category_data = Object.entries(DEMO_CATEGORIES).map(([name, subcategories]) => ({ name, subcategories: [...subcategories] }));

  const people = DEMO_USERS.map(u => ({ key: u.id, label: u.label, color: u.color }));

  return { transactions, income, standard_budgets, monthly_budgets, category_data, people };
}
