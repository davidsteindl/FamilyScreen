import { config } from "dotenv";
import { drizzle } from "drizzle-orm/neon-http";

import { dailyMessageProblems } from "@/lib/daily-message/rules";

import { dailyMessages } from "./schema";
import { DAILY_MESSAGE_SEEDS } from "./seed-content-data";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const db = drizzle(databaseUrl);

async function main() {
  for (const seed of DAILY_MESSAGE_SEEDS) {
    const problems = dailyMessageProblems(seed.text);

    if (problems.length > 0) {
      throw new Error(`Invalid daily message "${seed.text}": ${problems.join(", ")}`);
    }
  }

  const inserted = await db
    .insert(dailyMessages)
    .values(DAILY_MESSAGE_SEEDS)
    .onConflictDoNothing({ target: dailyMessages.text })
    .returning({ id: dailyMessages.id });

  console.log(
    `Daily content seed complete: ${inserted.length} inserted and ${DAILY_MESSAGE_SEEDS.length - inserted.length} already present.`,
  );
  console.log("All new entries have status pending and require manual approval.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
