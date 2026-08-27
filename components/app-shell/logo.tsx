import { cn } from "@/lib/utils";

// Inline SVG so it stays crisp at every size and picks up currentColor if we
// ever need to invert it. Silhouette is validated to read at 24px (favicon)
// through 200px (marketing hero).
function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="ObjektConnect"
      className={className}
    >
      <defs>
        <linearGradient id="oc-logo-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1D3255" />
          <stop offset="60%" stopColor="#14233C" />
          <stop offset="100%" stopColor="#0B1626" />
        </linearGradient>
        <linearGradient id="oc-logo-highlight" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#5EEAD4" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" rx="52" fill="url(#oc-logo-grad)" />
      <rect x="4" y="4" width="192" height="80" rx="48" fill="url(#oc-logo-highlight)" />
      <path
        d="M 50 128 L 100 78 L 150 128"
        fill="none"
        stroke="#5EEAD4"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 62 128 L 62 150 L 138 150 L 138 128"
        fill="none"
        stroke="#FFFFFF"
        strokeOpacity="0.9"
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 75 140 L 90 132 L 105 138 L 122 122"
        fill="none"
        stroke="#5EEAD4"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="122" cy="122" r="4" fill="#5EEAD4" />
    </svg>
  );
}

export function ObjektConnectLogo({
  compact = false,
  className,
  name = "objekt.connect",
  claim = "Instandhaltung auf Autopilot.",
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
      {logoUrl ? (
        <span
          aria-hidden="true"
          className="h-11 w-11 shrink-0 rounded-xl bg-contain bg-center bg-no-repeat shadow-sm"
          style={{ backgroundImage: `url(${logoUrl})` }}
        />
      ) : (
        <LogoMark className="h-11 w-11 shrink-0 rounded-xl shadow-sm" />
      )}
      {!compact ? (
        <div className="leading-tight">
          <p className="text-lg font-bold tracking-tight text-primary">{name}</p>
          <p className="text-xs font-semibold text-accent">{claim}</p>
        </div>
      ) : null}
    </div>
  );
}

export { LogoMark };
