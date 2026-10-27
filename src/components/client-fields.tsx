export function ClientFields({
  client,
  team,
  emailReminders = true,
}: {
  client?: Record<string, string | null>;
  emailReminders?: boolean;
  team?: { id: string; name: string }[];
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">First name</label>
          <input className="input" name="first_name" defaultValue={client?.first_name ?? ""} required />
        </div>
        <div>
          <label className="label">Last name</label>
          <input className="input" name="last_name" defaultValue={client?.last_name ?? ""} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" name="email" type="email" defaultValue={client?.email ?? ""} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" name="phone" defaultValue={client?.phone ?? ""} />
        </div>
        <div>
          <label className="label">Status</label>
          <select className="input" name="status" defaultValue={client?.status ?? "lead"}>
            <option value="lead">Lead</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="alumni">Alumni</option>
          </select>
        </div>
        <div>
          <label className="label">How they found you</label>
          <input className="input" name="source" defaultValue={client?.source ?? ""} placeholder="Referral, Instagram, website…" />
        </div>
      </div>
      {team && team.length > 1 && (
        <div>
          <label className="label">Practitioner</label>
          <select className="input" name="practitioner_id" defaultValue={client?.practitioner_id ?? ""}>
            <option value="">Me</option>
            {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="email_reminders" defaultChecked={emailReminders} /> Send this client booking emails and reminders
      </label>
      <div>
        <label className="label">Background</label>
        <textarea className="input min-h-24" name="background" defaultValue={client?.background ?? ""} placeholder="What they want to work on, context worth remembering" />
      </div>
    </>
  );
}
