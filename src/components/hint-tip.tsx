import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One-time onboarding tooltip. Dismissal is remembered per id in localStorage,
 * so first-time users get guidance and repeat visits stay clean.
 */
export function HintTip({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  const storageKey = `nexdrive.hint.${id}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(localStorage.getItem(storageKey) !== "dismissed");
    } catch {
      setOpen(true);
    }
  }, [storageKey]);

  if (!open) return null;

  return (
    <div
      role="note"
      className={cn(
        "ink-card stagger-in relative flex items-start gap-3 p-4 pr-11 text-sm",
        className,
      )}
    >
      <span
        className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-lime text-lime-foreground"
        aria-hidden="true"
      >
        <Sparkles className="size-4" />
      </span>
      <div className="space-y-1">
        <p className="font-semibold tracking-tight">{title}</p>
        <div className="text-ink-foreground/75">{children}</div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss tip"
        onClick={() => {
          setOpen(false);
          try {
            localStorage.setItem(storageKey, "dismissed");
          } catch {
            /* storage unavailable — dismissal stays session-only */
          }
        }}
        className="absolute right-2 top-2 min-h-11 min-w-11 text-ink-foreground/70 hover:bg-ink-foreground/10 hover:text-ink-foreground"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
