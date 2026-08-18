import * as React from "react";
import { cn } from "@/lib/utils";

export type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        "focus-ring h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-primary shadow-sm",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});
NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
