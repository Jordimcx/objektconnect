"use client";

import * as React from "react";
import { animate, useReducedMotion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function CountUp({ value }: { value: number }) {
  const reduce = useReducedMotion();
  // Starts at the real value (not 0) so SSR output and the pre-hydration
  // paint are always correct — a slow or blocked hydration must never leave
  // a stat tile showing the wrong number. The effect below is a pure client-
  // side enhancement layered on top of an already-correct render.
  const [display, setDisplay] = React.useState(value);

  React.useEffect(() => {
    if (reduce) return;
    const controls = animate(0, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest))
    });
    return () => controls.stop();
  }, [value, reduce]);

  return <>{display}</>;
}

export function StatTile({
  label,
  value,
  icon,
  tone = "accent"
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  tone?: "accent" | "primary";
}) {
  return (
    <Card className="hover:shadow-card-hover">
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={cn(
            "grid h-11 w-11 shrink-0 place-items-center rounded-lg",
            tone === "accent" ? "bg-accent-50 text-accent-700" : "bg-primary-50 text-primary-700"
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-primary">
            {typeof value === "number" ? <CountUp value={value} /> : value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
