import { cn } from "@/lib/utils";

/**
 * Shared loading placeholder. Shimmer is the default; pass shimmer={false}
 * for a static block. The shimmer keyframe is disabled automatically under
 * prefers-reduced-motion (see src/styles.css).
 */
function Skeleton({
  className,
  shimmer = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { shimmer?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-muted",
        shimmer ? "relative overflow-hidden" : "animate-pulse",
        className,
      )}
      {...props}
    >
      {shimmer && <span className="shimmer-surface absolute inset-0" />}
    </div>
  );
}

export { Skeleton };
