import { auth } from "@/auth";

import requireDevice from "./require-device";

export default async function authenticateActor(req: Request) {
  const authorization = req.headers.get("authorization");

  if (authorization) {
    const device = await requireDevice(req);

    if (!device) {
      return null;
    }

    return {
      type: "device" as const,
      userId: device.userId,
      deviceId: device.id,
    };
  }

  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return {
    type: "user" as const,
    userId: session.user.id,
  };
}