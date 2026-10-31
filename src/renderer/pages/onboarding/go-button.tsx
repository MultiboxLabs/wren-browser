// The button a step goes on with, which Return presses too: it shows the key.

import { CornerDownLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";

export function GoButton({
  disabled,
  onClick,
  className,
  children
}: {
  disabled: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Button
      variant="raised"
      shape="large"
      className={cn("gap-2.5 font-medium", className)}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      <CornerDownLeft size={14} strokeWidth={2.25} aria-hidden className="opacity-55" />
    </Button>
  );
}
