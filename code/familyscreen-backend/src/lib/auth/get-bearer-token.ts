export default function getBearerToken(
  request: Request,
): string | null {
  const authorization =
    request.headers.get("authorization");

  if (!authorization) {
    return null;
  }

  const match = authorization
    .trim()
    .match(/^Bearer ([A-Za-z0-9_-]+)$/);

  return match?.[1] ?? null;
}