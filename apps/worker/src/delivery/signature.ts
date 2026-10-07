import { createHmac } from "node:crypto";

/**
 * The webhook signature: HMAC-SHA256 over `${timestamp}.${rawBody}`, keyed with the endpoint
 * secret, sent as `v1=<hex>`. Signing the timestamp too means an old request cannot be
 * replayed later with a fresh timestamp.
 */
export function signPayload(
  secret: string,
  timestamp: number,
  rawBody: string,
): string {
  const hex = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");
  return `v1=${hex}`;
}
