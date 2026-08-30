import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * AI-style empty state: an animated glyph inside an electric-blue field,
 * a headline, one line of guidance and an optional action.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  hints,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  hints?: string[];
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("stagger-in flex flex-col items-center px-6 py-14 text-center", className)}>
      <div
        className="blue-field flex size-16 items-center justify-center rounded-2xl shadow-lift"
        style={{ animation: "var(--animate-bob)" }}
      >
        <Icon className="size-7" aria-hidden="true" />
      </div>
      <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>
      {hints && hints.length > 0 && (
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {hints.map((h) => (
            <li key={h} className="pill bg-surface-raised text-muted-foreground">
              <span className="size-1.5 rounded-full bg-lime" aria-hidden="true" />
              {h}
            </li>
          ))}
        </ul>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
