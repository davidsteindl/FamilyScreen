import { NextRequest, NextResponse } from "next/server";
import authenticateDevice from "./device-auth";
import getBearerToken from "./get-bearer-token";

export default async function requireDevice(req: NextRequest) {
   const token = getBearerToken(req);

  if (!token) {
    return null;
  }

  return await authenticateDevice(token);
}
