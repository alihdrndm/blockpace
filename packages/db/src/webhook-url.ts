import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

// The webhook URL rule, shared by the API (endpoint creation) and the worker (before every
// delivery). It lives in packages/db only because that is the package both apps import;
// the rule itself touches no database.
// It stops a webhook being pointed at this server's own network (SSRF). It does NOT defend
// against DNS rebinding: the address can change between this check and the request.

export type LookupAddresses = (
  host: string,
) => Promise<{ address: string; family: number }[]>;

export const systemLookup: LookupAddresses = (host) =>
  dnsLookup(host, { all: true });

export type UrlCheck = { ok: true } | { ok: false; reason: string };

const blocked = new BlockList();
blocked.addSubnet("127.0.0.0", 8, "ipv4"); // loopback
blocked.addSubnet("10.0.0.0", 8, "ipv4"); // private
blocked.addSubnet("172.16.0.0", 12, "ipv4"); // private
blocked.addSubnet("192.168.0.0", 16, "ipv4"); // private
blocked.addSubnet("169.254.0.0", 16, "ipv4"); // link-local
blocked.addSubnet("100.64.0.0", 10, "ipv4"); // carrier-grade NAT
blocked.addSubnet("0.0.0.0", 8, "ipv4"); // unspecified / "this network"
blocked.addAddress("::", "ipv6"); // unspecified
blocked.addAddress("::1", "ipv6"); // loopback
blocked.addSubnet("fc00::", 7, "ipv6"); // unique local
blocked.addSubnet("fe80::", 10, "ipv6"); // link-local

/** True when the address is in one of the ranges a webhook may not target. */
export function isBlockedAddress(address: string): boolean {
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1) must not slip past the IPv4 rules.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped?.[1] !== undefined) return blocked.check(mapped[1], "ipv4");
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) return blocked.check(address, "ipv6");
  // Not an IP address at all: refuse rather than guess.
  return true;
}

export async function checkWebhookUrl(
  rawUrl: string,
  options: { allowPrivate: boolean; lookup?: LookupAddresses },
): Promise<UrlCheck> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }

  const allowedSchemes = options.allowPrivate
    ? ["https:", "http:"]
    : ["https:"];
  if (!allowedSchemes.includes(url.protocol)) {
    return {
      ok: false,
      reason: `scheme must be ${allowedSchemes.join(" or ")}`,
    };
  }

  // URL keeps the brackets around IPv6 literals; dns and BlockList want them removed.
  const host = url.hostname.replace(/^\[(.*)\]$/, "$1");
  let addresses: string[];
  if (isIP(host) !== 0) {
    addresses = [host];
  } else {
    try {
      addresses = (await (options.lookup ?? systemLookup)(host)).map(
        (entry) => entry.address,
      );
    } catch {
      return { ok: false, reason: `could not resolve ${host}` };
    }
  }
  if (addresses.length === 0)
    return { ok: false, reason: `could not resolve ${host}` };

  // Any one blocked address rejects the URL: the request could go to whichever one DNS picks.
  const bad = addresses.find(isBlockedAddress);
  if (bad !== undefined && !options.allowPrivate) {
    return {
      ok: false,
      reason: `${host} resolves to a private or local address (${bad})`,
    };
  }
  return { ok: true };
}
