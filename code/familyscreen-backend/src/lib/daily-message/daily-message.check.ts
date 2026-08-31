import assert from "node:assert/strict";

import { DAILY_MESSAGE_SEEDS } from "@/db/seed-content-data";
import {
  chooseDailyCandidate,
  fallbackDailyMessage,
  viennaDateKey,
} from "./selection";
import {
  DAILY_MESSAGE_CATEGORIES,
  DAILY_MESSAGE_MAX_LENGTH,
  dailyMessageProblems,
} from "./rules";

assert.equal(DAILY_MESSAGE_SEEDS.length, 260);
assert.equal(
  new Set(DAILY_MESSAGE_SEEDS.map((seed) => seed.text)).size,
  DAILY_MESSAGE_SEEDS.length,
  "seed messages must be unique",
);

for (const seed of DAILY_MESSAGE_SEEDS) {
  assert.deepEqual(dailyMessageProblems(seed.text), [], seed.text);
  assert.equal(seed.status, "pending");
  assert.ok(seed.sourceUrl.startsWith("https://"));
  // The same list backs the category CHECK constraint in schema.ts.
  assert.ok(
    DAILY_MESSAGE_CATEGORIES.includes(seed.category),
    `unknown category ${seed.category}`,
  );
}

// What the authoring form leans on, in the client and in the server action.
assert.ok(DAILY_MESSAGE_CATEGORIES.includes("family"));
// Blank text fails the font pattern too, so only the first problem is the one
// the form reports.
assert.equal(dailyMessageProblems("   ")[0], "Text is empty");
assert.equal(dailyMessageProblems("a".repeat(DAILY_MESSAGE_MAX_LENGTH)).length, 0);
assert.equal(
  dailyMessageProblems("a".repeat(DAILY_MESSAGE_MAX_LENGTH + 1)).length,
  1,
);
assert.equal(dailyMessageProblems("Schoene Gruesse \u{1F600}").length, 1);

// Vienna crosses into the next day while UTC is still on the prior date.
assert.equal(viennaDateKey(new Date("2026-08-30T21:30:00Z")), "2026-08-30");
assert.equal(viennaDateKey(new Date("2026-08-30T22:30:00Z")), "2026-08-31");

const candidates = [
  { id: 1, text: "one" },
  { id: 2, text: "two" },
  { id: 3, text: "three" },
];
const history = new Map([
  [1, "2026-08-29"],
  [2, "2026-08-20"],
]);

assert.equal(
  chooseDailyCandidate("2026-08-30", candidates, history)?.id,
  3,
  "unused messages come before used messages",
);
assert.equal(
  chooseDailyCandidate(
    "2026-08-30",
    candidates.slice(0, 2),
    history,
  )?.id,
  2,
  "least recently used message wins",
);
assert.deepEqual(
  chooseDailyCandidate("2026-08-30", candidates, history),
  chooseDailyCandidate("2026-08-30", candidates, history),
  "selection is stable within a day",
);

for (let offset = 0; offset < 20; offset++) {
  assert.deepEqual(
    dailyMessageProblems(
      fallbackDailyMessage(),
    ),
    [],
  );
}

console.log("daily message check ok");
