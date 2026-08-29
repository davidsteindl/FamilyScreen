import authenticateDevice from "./device-auth";
import getBearerToken from "./get-bearer-token";

export default async function requireDevice(req: Request) {
   const token = getBearerToken(req);

  if (!token) {
    return null;
  }

  return await authenticateDevice(token);
}
