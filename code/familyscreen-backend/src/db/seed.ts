import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import hashDeviceToken from "@/lib/auth/hash-device-token";

import { devices, users } from "./schema";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const db = drizzle(databaseUrl);

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function generateDeviceToken() {
  return `fs_${randomBytes(32).toString("base64url")}`;
}

async function upsertUser(name: string, email?: string, passwordHash?: string) {
  const [user] = await db
    .insert(users)
    .values({ name, email, passwordHash })
    .onConflictDoUpdate({
      target: users.name,
      set: { name, email, passwordHash },
    })
    .returning({
      id: users.id,
      name: users.name,
    });

  if (!user) {
    throw new Error(`Failed to upsert user "${name}"`);
  }

  return user;
}

async function main() {
  const user2PasswordHash = await hash(
    getRequiredEnv("SEED_USER2_PASSWORD"),
    12,
  );

  const user3PasswordHash = await hash(
    getRequiredEnv("SEED_USER3_PASSWORD"),
    12,
  );

  const user1 = await upsertUser(getRequiredEnv("SEED_USER1_NAME"));
  const user2 = await upsertUser(
    getRequiredEnv("SEED_USER2_NAME"),
    getRequiredEnv("SEED_USER2_EMAIL"),
    user2PasswordHash,
  );

  const user3 = await upsertUser(
    getRequiredEnv("SEED_USER3_NAME"),
    getRequiredEnv("SEED_USER3_EMAIL"),
    user3PasswordHash,
  );

  console.log("Users:");
  console.log(`- ${user1.name}`);
  console.log(`- ${user2.name}`);
  console.log(`- ${user3.name}`);

  const deviceName = `fs_FamilyScreen ${user1.name}`;

  const [existingDevice] = await db
    .select({
      id: devices.id,
      name: devices.name,
    })
    .from(devices)
    .where(and(eq(devices.userId, user1.id), eq(devices.name, deviceName)))
    .limit(1);

  if (existingDevice) {
    console.log(`\nDevice "${deviceName}" already exists.`);

    console.log("No new bearer token was generated.");

    return;
  }

  const rawToken = generateDeviceToken();
  const tokenHash = hashDeviceToken(rawToken);

  await db.insert(devices).values({
    userId: user1.id,
    name: deviceName,
    tokenHash,
  });

  console.log(`\n✅ Created device: ${deviceName}`);

  console.log(`
========================================
DEVICE BEARER TOKEN
========================================

${rawToken}

Copy this token to the ESP32 now.

Only the SHA-256 hash is stored in the database.
The raw token cannot be recovered later.
========================================
`);
}

main()
  .then(() => {
    console.log("✅ Seed completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Seed failed");
    console.error(error);
    process.exit(1);
  });
