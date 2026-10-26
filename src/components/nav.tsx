"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Today" },
  { href: "/calendar", label: "Calendar" },
  { href: "/clients", label: "Clients" },
  { href: "/invoices", label: "Invoices" },
  { href: "/offers", label: "Offers" },
  { href: "/hours", label: "Coaching hours" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:px-2">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-lg px-3 py-2 text-sm whitespace-nowrap transition ${
              active ? "bg-accent-soft font-medium text-accent" : "text-ink/80 hover:bg-bg"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
