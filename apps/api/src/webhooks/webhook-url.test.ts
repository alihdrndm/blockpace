import { describe, expect, it } from "vitest";
import {
  checkWebhookUrl,
  isBlockedAddress,
  type LookupAddresses,
} from "./webhook-url.js";

// A fake DNS: tests never touch the network.
const DNS: Record<string, string[]> = {
  "hooks.example.com": ["93.184.216.34"],
  "dual.example.com": ["93.184.216.34", "2606:2800:220:1::1"],
  "sneaky.example.com": ["93.184.216.34", "10.1.2.3"],
  "internal.example.com": ["192.168.1.20"],
  "empty.example.com": [],
};
const lookup: LookupAddresses = async (host) => {
  const found = DNS[host];
  if (found === undefined) throw new Error("ENOTFOUND");
  return found.map((address) => ({
    address,
    family: address.includes(":") ? 6 : 4,
  }));
};

describe("checkWebhookUrl (webhook URL rule)", () => {
  const cases: {
    url: string;
    allowPrivate: boolean;
    ok: boolean;
    why: string;
  }[] = [
    {
      url: "https://hooks.example.com/x",
      allowPrivate: false,
      ok: true,
      why: "public https",
    },
    {
      url: "https://dual.example.com/",
      allowPrivate: false,
      ok: true,
      why: "public v4 + v6",
    },
    {
      url: "http://hooks.example.com/x",
      allowPrivate: false,
      ok: false,
      why: "http not allowed",
    },
    {
      url: "ftp://hooks.example.com/x",
      allowPrivate: true,
      ok: false,
      why: "other schemes",
    },
    { url: "not a url", allowPrivate: false, ok: false, why: "unparseable" },
    {
      url: "https://missing.example.com/",
      allowPrivate: false,
      ok: false,
      why: "DNS failure",
    },
    {
      url: "https://empty.example.com/",
      allowPrivate: false,
      ok: false,
      why: "no addresses",
    },
    {
      url: "https://sneaky.example.com/",
      allowPrivate: false,
      ok: false,
      why: "any private address",
    },
    {
      url: "https://internal.example.com/",
      allowPrivate: false,
      ok: false,
      why: "private 192.168/16",
    },
    {
      url: "https://127.0.0.1/",
      allowPrivate: false,
      ok: false,
      why: "loopback literal",
    },
    {
      url: "https://10.0.0.5/",
      allowPrivate: false,
      ok: false,
      why: "private 10/8",
    },
    {
      url: "https://172.16.0.1/",
      allowPrivate: false,
      ok: false,
      why: "private 172.16/12 start",
    },
    {
      url: "https://172.31.255.255/",
      allowPrivate: false,
      ok: false,
      why: "private 172.16/12 end",
    },
    {
      url: "https://172.32.0.1/",
      allowPrivate: false,
      ok: true,
      why: "just outside 172.16/12",
    },
    {
      url: "https://169.254.169.254/",
      allowPrivate: false,
      ok: false,
      why: "link-local (metadata)",
    },
    {
      url: "https://100.64.0.1/",
      allowPrivate: false,
      ok: false,
      why: "carrier-grade NAT",
    },
    {
      url: "https://0.0.0.0/",
      allowPrivate: false,
      ok: false,
      why: "unspecified v4",
    },
    {
      url: "https://[::1]/",
      allowPrivate: false,
      ok: false,
      why: "IPv6 loopback",
    },
    {
      url: "https://[::]/",
      allowPrivate: false,
      ok: false,
      why: "IPv6 unspecified",
    },
    {
      url: "https://[fd12::1]/",
      allowPrivate: false,
      ok: false,
      why: "IPv6 fc00::/7",
    },
    {
      url: "https://[fe80::1]/",
      allowPrivate: false,
      ok: false,
      why: "IPv6 fe80::/10",
    },
    {
      url: "https://[::ffff:10.0.0.1]/",
      allowPrivate: false,
      ok: false,
      why: "IPv4-mapped",
    },
    {
      url: "https://[2606:2800:220:1::1]/",
      allowPrivate: false,
      ok: true,
      why: "public IPv6",
    },
    {
      url: "http://localhost:4999/",
      allowPrivate: true,
      ok: true,
      why: "dev sink allowed",
    },
    {
      url: "http://10.0.0.5/",
      allowPrivate: true,
      ok: true,
      why: "private allowed in dev",
    },
  ];

  for (const c of cases) {
    it(`${c.ok ? "allows" : "rejects"} ${c.url} (${c.why}, allowPrivate=${c.allowPrivate})`, async () => {
      const localhost: LookupAddresses = async () => [
        { address: "127.0.0.1", family: 4 },
      ];
      const resolver: LookupAddresses = (host) =>
        host === "localhost" ? localhost(host) : lookup(host);
      const result = await checkWebhookUrl(c.url, {
        allowPrivate: c.allowPrivate,
        lookup: resolver,
      });
      expect(result.ok).toBe(c.ok);
      if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
    });
  }
});

describe("isBlockedAddress", () => {
  it("refuses anything that is not an IP address", () => {
    expect(isBlockedAddress("example.com")).toBe(true);
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
  });
});
