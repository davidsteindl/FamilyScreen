import { neon } from "@neondatabase/serverless";
import { URL } from "node:url";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) return console.log("DATABASE_URL ist nicht gesetzt");
  console.log("Datenbank:", new URL(url).hostname);

  const sql = neon(url);

  const [check] = (await sql`
    select pg_get_constraintdef(oid) as def
    from pg_constraint
    where conname = 'daily_messages_category_valid'
  `) as { def: string }[];

  console.log("CHECK     :", check?.def ?? "(Constraint fehlt)");
  console.log("Migration :", check?.def?.includes("generated") ? "ANGEWENDET" : "FEHLT NOCH");

  const rows = (await sql`
    select status, count(*)::int as n from daily_messages group by status order by status
  `) as { status: string; n: number }[];
  console.log("Sprueche  :", rows.length ? rows.map((r) => `${r.status}=${r.n}`).join("  ") : "(Tabelle leer)");
}
main();
