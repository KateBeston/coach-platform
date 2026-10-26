import { Nav } from "@/components/nav";
import { getCoach } from "@/lib/coach";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { coach } = await getCoach();
  const name = coach.business_name || coach.display_name || "Your business";

  return (
    <div className="min-h-screen md:flex">
      <aside className="print:hidden border-b border-line bg-surface md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <p className="truncate font-serif text-lg">{name}</p>
          <p className="hidden text-xs text-muted md:block">{coach.email}</p>
        </div>
        <Nav />
        <form action={signOut} className="hidden px-4 py-4 md:absolute md:bottom-0 md:block">
          <button className="text-xs text-muted hover:text-ink">Sign out</button>
        </form>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
