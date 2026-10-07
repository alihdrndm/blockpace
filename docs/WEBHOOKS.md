# Webhooks

blockpace sends an HTTP `POST` to every active webhook endpoint when an alert is raised (a risk level change, an approaching cutoff, a stale pickup report) and when you press "Send test". The worker process delivers them; the API only queues them.

## Request

```http
POST /your/path HTTP/1.1
content-type: application/json
user-agent: blockpace-webhooks/1
x-blockpace-event: RISK_LEVEL_CHANGED
x-blockpace-delivery: 0199b8a2-6f3e-7c41-9a55-2f6d3c1e8b10
x-blockpace-timestamp: 1791374400
x-blockpace-signature: v1=5d41402abc4b2a76b9719d911017c592...
```

| Header | Meaning |
|--------|---------|
| `x-blockpace-event` | `RISK_LEVEL_CHANGED`, `CUTOFF_APPROACHING`, `SNAPSHOT_STALE` or `PING`. |
| `x-blockpace-delivery` | The delivery id. The same id is reused on every retry of that delivery, so you can ignore duplicates. |
| `x-blockpace-timestamp` | Unix seconds when this attempt was sent. |
| `x-blockpace-signature` | `v1=` + hex HMAC-SHA256 of `"<timestamp>.<raw body>"`, keyed with the endpoint's secret. |

## Payload

Alerts:

```json
{
  "id": "<alert id>",
  "type": "RISK_LEVEL_CHANGED",
  "createdAt": "2026-10-06T00:05:00Z",
  "block": { "id": "...", "name": "TechConf", "hotelName": "Courtyard Annex", "currency": "USD", "cutoffDate": "2026-10-20" },
  "evaluation": { "...": "the full Evaluation, as returned by GET /v1/blocks/:id/evaluation" },
  "previousRiskLevel": "on_track"
}
```

`previousRiskLevel` is present only when the block had an earlier evaluation. A test delivery is `{ "id": "<delivery id>", "type": "PING", "createdAt": "..." }`.

## Answering

Answer with any `2xx` status within 5 seconds. Everything else counts as a failure: other statuses, **redirects (3xx are not followed)**, timeouts, DNS failures, and URLs that break the webhook URL rule (see `SECURITY.md`).

## Retries

| Attempt | Sent after the previous failure |
|---------|---------------------------------|
| 1 | immediately |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |
| 6 | 12 hours |

After the 6th failed attempt the delivery is marked `failed` and not retried. `GET /v1/webhook-deliveries` shows each delivery's status, attempts, last status code and next attempt time.

## Verifying the signature (Node)

Verify against the **raw** request body, before any JSON parsing, and reject old timestamps to stop replays.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyBlockpace(headers, rawBody, secret, toleranceSeconds = 300) {
  const timestamp = headers["x-blockpace-timestamp"] ?? "";
  const given = Buffer.from(headers["x-blockpace-signature"] ?? "");
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  const hex = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expected = Buffer.from(`v1=${hex}`);
  // timingSafeEqual needs equal lengths; a length mismatch is simply "not valid".
  return given.length === expected.length && timingSafeEqual(given, expected);
}
```

## Trying it locally

`pnpm sink` starts `tools/webhook-sink.ts` on port 4999. It checks every signature with `SINK_SECRET` and prints one line per request, ending in `signature OK` or `signature MISMATCH`. `pnpm db:seed` creates an endpoint pointing at it with the matching secret.
