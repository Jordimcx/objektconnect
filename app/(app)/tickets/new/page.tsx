import { redirect } from "next/navigation";
import { DamageWizard } from "@/components/tickets/damage-wizard";
import { CATEGORY_LABELS, PRIORITY_LABELS, TICKET_CATEGORIES, TICKET_PRIORITIES } from "@/lib/constants";
import { requireSessionUser } from "@/lib/session";

export default async function NewTicketPage() {
  const user = await requireSessionUser();
  if (user.role !== "MIETER") redirect("/tickets");

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold text-accent">Neue Schadensmeldung</p>
        <h1 className="text-3xl font-bold text-primary">Schaden melden</h1>
        <p className="mt-2 max-w-2xl text-slate-600">
          Die Meldung wird direkt Ihrer Wohneinheit zugeordnet und die Hausverwaltung erhält eine Benachrichtigung.
        </p>
      </div>
      <DamageWizard
        categories={TICKET_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] }))}
        priorities={TICKET_PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }))}
      />
    </div>
  );
}
