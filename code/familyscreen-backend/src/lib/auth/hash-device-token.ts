import { createHash } from "crypto";

export default function hashDeviceToken(token: string) {
  return createHash("sha256")
  .update(token)
  .digest("hex");
}
