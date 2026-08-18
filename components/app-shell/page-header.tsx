export function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm font-semibold text-accent">{eyebrow}</p>
        <h1 className="text-3xl font-bold text-primary">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-slate-600">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
