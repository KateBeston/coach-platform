"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string; managers?: boolean; teamOnly?: boolean };

const LINKS: NavLink[] = [
  { href: "/", label: "Today" },
  { href: "/calendar", label: "Calendar" },
  { href: "/clients", label: "Clients" },
  { href: "/invoices", label: "Invoices", managers: true },
  { href: "/money", label: "Money", managers: true },
  { href: "/offers", label: "Offers", managers: true },
  { href: "/team", label: "Team", managers: true, teamOnly: true },
  { href: "/hours", label: "Coaching hours" },
  { href: "/settings", label: "Settings" },
];

export function Nav({ isManager, hasTeam }: { isManager: boolean; hasTeam: boolean }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 pb-3 md:flex-col md:px-2">
      {LINKS.filter((l) => (!l.managers || isManager) && (!l.teamOnly || hasTeam)).map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`rounded-xl px-3 py-2 text-sm whitespace-nowrap transition ${
              active ? "bg-surface/90 font-semibold text-accent shadow-[0_1px_3px_rgba(31,58,61,0.06)]" : "text-ink/80 hover:bg-surface/60 hover:text-accent"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
