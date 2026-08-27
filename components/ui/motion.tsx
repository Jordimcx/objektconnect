import * as React from "react";
import { cn } from "@/lib/utils";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

// CSS-driven, not JS-driven: content is never gated on client hydration
// completing. See the .animate-fade-up keyframes in app/globals.css.
export function FadeUp({ delay = 0, className, style, children, ...props }: DivProps & { delay?: number }) {
  return (
    <div className={cn("animate-fade-up", className)} style={{ animationDelay: `${delay}s`, ...style }} {...props}>
      {children}
    </div>
  );
}

export function StaggerGroup({ className, children, ...props }: DivProps) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

export function StaggerItem({ index = 0, className, style, children, ...props }: DivProps & { index?: number }) {
  const cappedIndex = Math.min(index, 8);
  return (
    <div className={cn("animate-fade-up", className)} style={{ animationDelay: `${cappedIndex * 0.06}s`, ...style }} {...props}>
      {children}
    </div>
  );
}
