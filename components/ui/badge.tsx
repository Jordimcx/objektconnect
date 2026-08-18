import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold", {
  variants: {
    variant: {
      default: "border-slate-200 bg-slate-100 text-slate-700",
      success: "border-green-200 bg-green-50 text-green-700",
      warning: "border-orange-200 bg-orange-50 text-orange-700",
      danger: "border-red-200 bg-red-50 text-red-700",
      accent: "border-teal-200 bg-teal-50 text-teal-700"
    }
  },
  defaultVariants: {
    variant: "default"
  }
});

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
