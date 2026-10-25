// Month math must not depend on the machine's time zone. Each zone runs in its own
// Node process (TZ is read at startup), exercising the exact cases that used to break.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const lib = new URL("../pb_public/js/lib.js", import.meta.url).href;

const probe = `
  const { monthKey, monthSeq, savingsRows, recurringToCopy } = await import(${JSON.stringify(lib)});
  // Evening of the last day of a month, local time: still that month.
  const lateOnLastDay = monthKey(new Date(2026, 0, 31, 22, 30));
  // Start of the month, local time: still that month.
  const startOfMonth = monthKey(new Date(2026, 2, 1, 0, 0));
  const seq = monthSeq(3, new Date(2026, 2, 1, 0, 5));
  const savingsStart = savingsRows([], [{ date: "2025-09-01", amount: 1 }], new Date(2025, 9, 1, 0, 5))[0].month;
  const recurring = recurringToCopy([{ user: "a", date: "2026-02-01", amount: 1, recurring: true }], "2026-03", "a")[0]?.date;
  console.log(JSON.stringify({ lateOnLastDay, startOfMonth, seq, savingsStart, recurring }));
`;

const expected = {
  lateOnLastDay: "2026-01",
  startOfMonth: "2026-03",
  seq: ["2026-01", "2026-02", "2026-03"],
  savingsStart: "2025-09",
  recurring: "2026-03-01"
};

for (const tz of ["UTC", "America/Los_Angeles", "America/New_York", "Pacific/Honolulu", "Europe/Berlin", "Asia/Tokyo", "Pacific/Kiritimati"]) {
  test(`month math is correct in ${tz}`, () => {
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
      env: { ...process.env, TZ: tz },
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      encoding: "utf8"
    });
    assert.deepEqual(JSON.parse(out), expected);
  });
}
