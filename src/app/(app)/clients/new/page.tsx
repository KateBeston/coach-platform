import { Banner, PageHeader } from "@/components/ui";
import { createClientAction } from "../../actions";
import { ClientFields } from "@/components/client-fields";
import { getCoach } from "@/lib/coach";

export default async function NewClientPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { team, isManager } = await getCoach();
  return (
    <>
      <PageHeader title="Add a client" />
      <Banner error={error} />
      <form action={createClientAction} className="card max-w-2xl space-y-4">
        <ClientFields team={isManager ? team : undefined} />
        <button className="btn">Save client</button>
      </form>
    </>
  );
}

