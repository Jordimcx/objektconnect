"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

export function ConfirmSubmitButton({
  confirmText,
  pendingText,
  children,
  ...props
}: ButtonProps & { confirmText?: string; pendingText?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      {...props}
      type="submit"
      disabled={pending || props.disabled}
      onClick={(event) => {
        if (confirmText && !window.confirm(confirmText)) {
          event.preventDefault();
        }
        props.onClick?.(event);
      }}
    >
      {pending ? (pendingText ?? "Wird gespeichert...") : children}
    </Button>
  );
}
