import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <Icon className="mx-auto h-10 w-10 text-slate-400" aria-hidden="true" />
      <h2 className="mt-4 text-base font-semibold text-primary">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{description}</p>
      {action ? (
        <Button asChild className="mt-5">
          <a href={action.href}>{action.label}</a>
        </Button>
      ) : null}
    </div>
  );
}
