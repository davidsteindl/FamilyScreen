import { NextRequest, NextResponse } from "next/server";
import authenticateDevice from "./lib/auth/device-auth";
import getBearerToken from "./lib/auth/get-bearer-token";

export async function proxy(req: NextRequest) {
  const token = getBearerToken(req);

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await authenticateDevice(token))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
