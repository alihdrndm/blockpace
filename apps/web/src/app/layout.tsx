import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "blockpace",
  description: "Hotel room-block attrition risk for event planners.",
};

const NAV = [
  { href: "/", label: "Blocks" },
  { href: "/calculator", label: "Calculator" },
  { href: "/webhooks", label: "Webhooks" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-slate-300">
          <nav
            aria-label="Main"
            className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3"
          >
            <Link href="/" className="text-lg font-semibold">
              blockpace
            </Link>
            <ul className="flex gap-4 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="underline-offset-4 hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
