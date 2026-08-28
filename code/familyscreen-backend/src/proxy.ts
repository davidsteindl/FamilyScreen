import {NextRequest, NextResponse} from "next/server"
import authenticateDevice from "./lib/device-auth";

export async function proxy(req: NextRequest){
const authorization = req.headers.get("authorization");

  if (!authorization) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!(await authenticateDevice(token))){
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};