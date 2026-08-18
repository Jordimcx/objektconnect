"use client";

import { useEffect } from "react";
import { toast } from "@/components/ui/toast";

export function NoticeToast({
  message,
  type = "success"
}: {
  message?: string;
  type?: "success" | "error" | "info";
}) {
  useEffect(() => {
    if (message) {
      toast({
        title: type === "error" ? "Aktion nicht möglich" : "Gespeichert",
        description: message,
        variant: type
      });
    }
  }, [message, type]);

  return null;
}
