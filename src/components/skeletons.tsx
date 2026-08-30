import { cn } from "@/lib/utils";

/** Shimmering placeholder block matching the console surface tokens. */
export function Shimmer({ className }: { className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted", className)}>
      <div className="shimmer-surface absolute inset-0" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-1">
          <Shimmer className="size-8 rounded-lg" />
          <Shimmer className="h-4 flex-1" />
          <Shimmer className="hidden h-4 w-24 sm:block" />
          <Shimmer className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="panel space-y-4 p-5">
          <div className="flex items-center gap-3">
            <Shimmer className="size-9 rounded-lg" />
            <Shimmer className="h-4 w-40" />
          </div>
          <Shimmer className="h-1.5 rounded-full" />
          <Shimmer className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}
