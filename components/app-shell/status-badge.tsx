import { TicketPriority, TicketStatus } from "@prisma/client";
import { CATEGORY_LABELS, PRIORITY_LABELS, PRIORITY_STYLES, STATUS_LABELS, STATUS_STYLES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", STATUS_STYLES[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold", PRIORITY_STYLES[priority])}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

export function CategoryBadge({ category }: { category: keyof typeof CATEGORY_LABELS }) {
  return (
    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
      {CATEGORY_LABELS[category]}
    </span>
  );
}
