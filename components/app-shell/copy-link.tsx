"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CopyLink({ value, label = "Link kopieren" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex min-w-0 gap-2">
      <Input value={value} readOnly aria-label="Sicherer Link" className="min-w-0" />
      <Button type="button" size="icon" variant="outline" onClick={copy} title={label} aria-label={label}>
        {copied ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </Button>
    </div>
  );
}
