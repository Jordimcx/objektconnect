import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return (
    <div className="grid min-h-screen place-items-center bg-muted">
      <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-5 py-4 text-sm font-semibold text-primary shadow-soft">
        <LoaderCircle className="h-5 w-5 animate-spin text-accent" aria-hidden="true" />
        objekt.connect wird geladen
      </div>
    </div>
  );
}
