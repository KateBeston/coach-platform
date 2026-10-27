"use client";

import { useState } from "react";
import { CATEGORIES } from "@/lib/accounting";

/** New expense. Works out the GST in a GST-inclusive amount, which can be overridden. */
export function ExpenseForm({ action, today, gstRegistered, gstRate }: { action: (fd: FormData) => void; today: string; gstRegistered: boolean; gstRate: number }) {
  const [amount, setAmount] = useState("");
  const [includesGst, setIncludesGst] = useState(gstRegistered);
  const [gstOverride, setGstOverride] = useState<string | null>(null);
  const auto = amount && includesGst ? ((Number(amount) * gstRate) / (100 + gstRate)).toFixed(2) : "0.00";
  const gst = gstOverride ?? auto;

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Date</label>
          <input type="date" name="spent_on" className="input" defaultValue={today} required />
        </div>
        <div>
          <label className="label">Amount paid ($)</label>
          <input
            type="number"
            name="amount"
            className="input"
            min={0}
            step="0.01"
            required
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setGstOverride(null);
            }}
          />
        </div>
      </div>
      <div>
        <label className="label">Paid to</label>
        <input name="supplier" className="input" required placeholder="e.g. Zoom, your supervisor, Officeworks" />
      </div>
      <div>
        <label className="label">Category</label>
        <select name="category" className="input" defaultValue="other">
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div>
        <label className="label">What for (optional)</label>
        <input name="description" className="input" />
      </div>
      {gstRegistered && (
        <div className="grid grid-cols-2 items-end gap-2">
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={includesGst}
              onChange={(e) => {
                setIncludesGst(e.target.checked);
                setGstOverride(null);
              }}
            />
            Includes GST
          </label>
          <div>
            <label className="label">GST ($)</label>
            <input type="number" name="gst" className="input" min={0} step="0.01" value={gst} onChange={(e) => setGstOverride(e.target.value)} />
          </div>
        </div>
      )}
      <div>
        <label className="label">Paid with (optional)</label>
        <input name="payment_method" className="input" placeholder="Business card, bank transfer…" />
      </div>
      <div>
        <label className="label">Receipt (optional)</label>
        <input type="file" name="receipt" accept="image/*,application/pdf" capture="environment" className="block w-full text-sm text-muted file:mr-3 file:rounded-xl file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-accent" />
        <p className="mt-1 text-xs text-muted">A photo or PDF, up to 10 MB.</p>
      </div>
      <button className="btn w-full">Save expense</button>
    </form>
  );
}
