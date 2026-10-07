// A tiny local webhook receiver for demos: it checks every request's signature and prints
// one line per request. Run with `pnpm sink` (it reads SINK_SECRET from the root .env).
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const PORT = 4999;
const secret = process.env.SINK_SECRET ?? "";
if (secret === "") {
  console.error("SINK_SECRET is not set; signatures cannot be checked.");
  process.exit(1);
}

const header = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? "") : (value ?? "");

/** Recomputes v1=HMAC-SHA256(secret, "timestamp.rawBody") and compares in constant time. */
function signatureMatches(
  timestamp: string,
  rawBody: string,
  given: string,
): boolean {
  const expected = `v1=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex")}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const ok = signatureMatches(
      header(request.headers["x-blockpace-timestamp"]),
      rawBody,
      header(request.headers["x-blockpace-signature"]),
    );
    console.log(
      `${header(request.headers["x-blockpace-event"]) || "(no event)"} ` +
        `${header(request.headers["x-blockpace-delivery"]) || "(no delivery id)"} ` +
        `signature ${ok ? "OK" : "MISMATCH"}`,
    );
    // Always 204, so a bad signature shows up here instead of as retries in the worker.
    response.writeHead(204);
    response.end();
  });
});

server.listen(PORT, () => {
  console.log(`webhook sink listening on http://localhost:${PORT}/`);
});
