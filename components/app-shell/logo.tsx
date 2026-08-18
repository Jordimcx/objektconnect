import { Building2, CircleUserRound, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ObjektConnectLogo({
  compact = false,
  className,
  name = "objektconnect",
  claim = "Vernetzt. Effizient. Zuverlässig.",
  logoUrl
}: {
  compact?: boolean;
  className?: string;
  name?: string;
  claim?: string;
  logoUrl?: string | null;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)} aria-label="ObjektConnect">
      <div className="relative grid h-11 w-11 place-items-center overflow-visible rounded-lg bg-primary text-white">
        {logoUrl ? <span aria-hidden="true" className="h-8 w-8 bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url(${logoUrl})` }} /> : <Building2 className="h-6 w-6" aria-hidden="true" />}
        <Share2 className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-accent p-0.5 text-white" aria-hidden="true" />
        <CircleUserRound className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full bg-white text-accent" aria-hidden="true" />
      </div>
      {!compact ? (
        <div className="leading-tight">
          <p className="text-lg font-bold tracking-normal text-primary">{name}</p>
          <p className="text-xs font-semibold text-accent">{claim}</p>
        </div>
      ) : null}
    </div>
  );
}
