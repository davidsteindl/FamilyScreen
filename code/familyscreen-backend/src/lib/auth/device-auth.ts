import { db } from "../../db/index";
import hashDeviceToken from "./hash-device-token";
import { devices } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";

export default async function authenticateDevice(token: string) {
  const tokenHash = hashDeviceToken(token);

  const [device] = await db
    .select({
      id: devices.id,
      userId: devices.userId,
    })
    .from(devices)
    .where(and(eq(devices.tokenHash, tokenHash), isNull(devices.revokedAt)))
    .limit(1);

  return device ?? null;
}
