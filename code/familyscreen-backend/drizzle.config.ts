import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: [
    "./src/db/schema.ts",
    "./src/features/daily-message/schema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",

  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
