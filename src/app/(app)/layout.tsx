import { Nav } from "@/components/nav";
import { getCoach } from "@/lib/coach";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { coach, me, isManager, hasTeam } = await getCoach();
  const name = coach.business_name || coach.display_name || "Your business";

  return (
    <div className="min-h-screen md:flex">
      <aside className="print:hidden wash border-b border-line md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-4 md:block">
          <p className="truncate font-serif text-xl">{name}</p>
          <p className="hidden text-xs text-muted md:block">{hasTeam ? me.name : me.email}</p>
        </div>
        <Nav isManager={isManager} hasTeam={hasTeam} />
        <form action={signOut} className="hidden px-4 py-4 md:absolute md:bottom-0 md:block">
          <button className="text-sm text-accent hover:underline">Sign out</button>
        </form>
      </aside>
      <main className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
