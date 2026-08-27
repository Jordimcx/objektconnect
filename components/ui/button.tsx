import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "focus-ring inline-flex min-h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-all duration-150 ease-fluid active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary-700 hover:shadow-card",
        accent: "bg-accent text-accent-foreground shadow-sm hover:bg-accent-600 hover:shadow-glow",
        outline: "border border-slate-200 bg-white text-primary hover:border-slate-300 hover:bg-muted",
        ghost: "text-primary hover:bg-muted",
        destructive: "bg-destructive text-destructive-foreground hover:bg-red-700",
        secondary: "bg-slate-100 text-primary hover:bg-slate-200"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-12 px-5 text-base",
        icon: "h-10 w-10"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
