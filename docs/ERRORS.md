# Errors

Every non-2xx response from the API is `application/problem+json` ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)):

```json
{
  "type": "https://github.com/alihdrndm/blockpace/blob/main/docs/ERRORS.md#VALIDATION_FAILED",
  "title": "Validation failed",
  "status": 422,
  "detail": "2 fields failed validation.",
  "code": "VALIDATION_FAILED",
  "instance": "0199b8a2-6f3e-7c41-9a55-2f6d3c1e8b10",
  "errors": [{ "path": "nights.0.date", "code": "custom", "message": "must be a real calendar date (YYYY-MM-DD)" }]
}
```

- `code` is stable; match on it, not on `title` or `detail`.
- `instance` is the request id. It is also in the `x-request-id` response header and in the server log line for that request.
- `errors` appears only on validation failures: one entry per problem, with a dot-separated `path` into the request.
- A 500 never contains an internal message or stack trace; the server logs those against the same request id.

| Code | Status | Meaning |
|------|--------|---------|
| [`VALIDATION_FAILED`](#VALIDATION_FAILED) | 422 | The body, query or path did not match the schema. |
| [`UNAUTHORIZED`](#UNAUTHORIZED) | 401 | Missing or wrong `x-api-key` on a `/v1` route. |
| [`NOT_FOUND`](#NOT_FOUND) | 404 | No such route, block, snapshot or webhook endpoint. |
| [`RATE_LIMITED`](#RATE_LIMITED) | 429 | More than 120 requests in a minute from one IP address. |
| [`INTERNAL`](#INTERNAL) | 500 | Unexpected server error. |
| [`BAD_REQUEST`](#BAD_REQUEST) | 400 | The request could not be read at all, for example malformed JSON. |
| [`PAYLOAD_TOO_LARGE`](#PAYLOAD_TOO_LARGE) | 413 | The request body is larger than the server accepts. |
| [`UNAVAILABLE`](#UNAVAILABLE) | 503 | `GET /readyz` only: a dependency (the database) is not reachable. |
| [`SNAPSHOT_NIGHTS_MISMATCH`](#SNAPSHOT_NIGHTS_MISMATCH) | 422 | Snapshot night dates differ from the block's nights. |
| [`SNAPSHOT_IN_FUTURE`](#SNAPSHOT_IN_FUTURE) | 422 | The snapshot's as-of date is later than today + 1 day. |
| [`RESOLD_EXCEEDS_CONTRACTED`](#RESOLD_EXCEEDS_CONTRACTED) | 422 | `resoldRooms` is more than that night's contracted rooms. |
| [`IMPORT_INVALID`](#IMPORT_INVALID) | 422 | The CSV import has a bad header, a bad cell, or a date group missing nights. |
| [`WEBHOOK_URL_NOT_ALLOWED`](#WEBHOOK_URL_NOT_ALLOWED) | 422 | The webhook URL fails the URL rule. |
| [`SNAPSHOT_LIMIT`](#SNAPSHOT_LIMIT) | 409 | The block already has 400 snapshots. |

## VALIDATION_FAILED
422. A Zod schema from `packages/core` rejected the request. This includes unknown keys, out-of-range numbers, impossible dates, nights that are not consecutive or are duplicated, and a `cutoffDate` after the first night. `errors[]` lists every issue.

## UNAUTHORIZED
401. Every `/v1` route needs the header `x-api-key` equal to the server's `API_KEY`. `/healthz`, `/readyz`, `/docs` and `/docs-json` never need it.

## NOT_FOUND
404. The route does not exist, or the block, snapshot or webhook endpoint id in the path does not exist.

## RATE_LIMITED
429. The limit is 120 requests per minute per IP address. Wait and retry.

## INTERNAL
500. Something unexpected failed. The response says nothing more on purpose; look up the `instance` (request id) in the server log.

## BAD_REQUEST
400. The request was unreadable before validation could start, most often a body that is not valid JSON.

## PAYLOAD_TOO_LARGE
413. The request body is over the server's limit (for CSV imports: 1 MB).

## UNAVAILABLE
503. Returned by `GET /readyz` when the database does not answer `select 1`. `GET /healthz` still answers 200.

## SNAPSHOT_NIGHTS_MISMATCH
422. A snapshot must report exactly the block's nights. `detail` lists the missing and the extra dates.

## SNAPSHOT_IN_FUTURE
422. A snapshot's as-of date may be at most one day after the server's today (to allow for time zones).

## RESOLD_EXCEEDS_CONTRACTED
422. On some night, `resoldRooms` is larger than that night's `contractedRooms`. `detail` names the nights.

## IMPORT_INVALID
422. The CSV upload was rejected as a whole; nothing was saved. Each `errors[]` entry has `path` set to `row <n>`.

## WEBHOOK_URL_NOT_ALLOWED
422. Webhook URLs must use `https` and must not resolve to a loopback, private, link-local, carrier-grade NAT or unspecified address. A local development server can allow `http` and private addresses with `ALLOW_PRIVATE_WEBHOOK_TARGETS=true`.

## SNAPSHOT_LIMIT
409. A block can hold at most 400 snapshots. Replacing an existing snapshot is still allowed.
