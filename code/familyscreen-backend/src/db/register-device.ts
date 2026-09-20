import { config } from "dotenv";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import hashDeviceToken from "@/lib/auth/hash-device-token";

import { devices, users } from "./schema";

config({ path: ".env.local" });

type Options = {
  deviceId: string;
  ownerName: string;
  production: boolean;
  apiBaseUrl?: string;
};

function valueAfter(args: string[], flag: string) {
  const index = args.indexOf(flag);
  const value = index >= 0 ? args[index + 1] : undefined;

  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function parseOptions(args: string[]): Options {
  const production = args.includes("--prod");
  const deviceId = valueAfter(args, "--device-id");
  const ownerName = args.includes("--owner")
    ? valueAfter(args, "--owner")
    : process.env.SEED_USER1_NAME;
  const apiBaseUrl = args.includes("--api-base")
    ? valueAfter(args, "--api-base").replace(/\/+$/, "")
    : undefined;

  if (!ownerName) {
    throw new Error("--owner or SEED_USER1_NAME is required");
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(deviceId)) {
    throw new Error(
      "--device-id must be 1-64 characters: letters, digits, underscore, or hyphen",
    );
  }

  return { deviceId, ownerName, production, apiBaseUrl };
}

function generateDeviceToken() {
  return `fs_${randomBytes(32).toString("base64url")}`;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const databaseUrl = options.production
    ? process.env.PROD_DATABASE_URL
    : process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      `${options.production ? "PROD_DATABASE_URL" : "DATABASE_URL"} is not set`,
    );
  }

  const db = drizzle(databaseUrl);
  const [owner] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.name, options.ownerName))
    .limit(1);

  if (!owner) {
    throw new Error(`Owner "${options.ownerName}" does not exist`);
  }

  const [existingDevice] = await db
    .select({ id: devices.id, revokedAt: devices.revokedAt })
    .from(devices)
    .where(
      and(eq(devices.userId, owner.id), eq(devices.name, options.deviceId)),
    )
    .limit(1);

  if (existingDevice) {
    throw new Error(
      `Device "${options.deviceId}" already exists (${existingDevice.id})`,
    );
  }

  const rawToken = generateDeviceToken();
  const tokenHash = hashDeviceToken(rawToken);
  const [created] = await db
    .insert(devices)
    .values({ userId: owner.id, name: options.deviceId, tokenHash })
    .returning({
      id: devices.id,
      name: devices.name,
      tokenHash: devices.tokenHash,
      revokedAt: devices.revokedAt,
    });

  if (
    !created ||
    created.name !== options.deviceId ||
    created.tokenHash !== tokenHash ||
    created.revokedAt !== null
  ) {
    throw new Error("Device persistence verification failed");
  }

  // Print the one-time credential as soon as persistence is confirmed. If the
  // optional API smoke test fails, the operator can still configure or revoke
  // the newly persisted device instead of losing the unrecoverable raw token.
  console.log(`FAMILY_DEVICE_TOKEN=${rawToken}`);

  if (options.apiBaseUrl) {
    const response = await fetch(`${options.apiBaseUrl}/device/metadata`, {
      headers: { Authorization: `Bearer ${rawToken}` },
    });

    if (!response.ok) {
      throw new Error(
        `Production API rejected the persisted token (HTTP ${response.status})`,
      );
    }
  }

  console.log(
    `Registered ${options.production ? "production " : ""}device ` +
      `"${created.name}" (${created.id}) for "${owner.name}".`,
  );
  console.log("Persistence and token authentication verified.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
