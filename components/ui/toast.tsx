"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

type ToastPayload = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

type ToastItem = ToastPayload & {
  id: string;
};

let toastSequence = 0;

export function createToastId() {
  toastSequence += 1;
  return `toast-${Date.now().toString(36)}-${toastSequence.toString(36)}`;
}

export function toast(payload: ToastPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastPayload>("objektconnect-toast", { detail: payload }));
}

export function ToastViewport() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    function onToast(event: Event) {
      const customEvent = event as CustomEvent<ToastPayload>;
      const id = createToastId();
      setItems((current) => [...current, { id, variant: "info", ...customEvent.detail }]);
      window.setTimeout(() => {
        setItems((current) => current.filter((item) => item.id !== id));
      }, 4500);
    }

    window.addEventListener("objektconnect-toast", onToast);
    return () => window.removeEventListener("objektconnect-toast", onToast);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3" aria-live="polite">
      {items.map((item) => {
        const Icon = item.variant === "success" ? CheckCircle2 : item.variant === "error" ? TriangleAlert : Info;
        return (
          <div
            key={item.id}
            className={cn(
              "rounded-lg border bg-white p-4 shadow-soft",
              item.variant === "success" && "border-green-200",
              item.variant === "error" && "border-red-200",
              item.variant === "info" && "border-slate-200"
            )}
          >
            <div className="flex items-start gap-3">
              <Icon className={cn("mt-0.5 h-5 w-5", item.variant === "error" ? "text-red-600" : "text-accent")} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">{item.title}</p>
                {item.description ? <p className="mt-1 text-sm text-slate-600">{item.description}</p> : null}
              </div>
              <Button
                aria-label="Benachrichtigung schließen"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setItems((current) => current.filter((toastItem) => toastItem.id !== item.id))}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
