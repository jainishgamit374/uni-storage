import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";

export function QuotaBar({
  used,
  total,
  className,
  showLabels = true,
}: {
  used: number;
  total: number;
  className?: string;
  showLabels?: boolean;
}) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const tone = pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", tone)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabels && (
        <div className="flex items-center justify-between text-numeric text-xs text-muted-foreground">
          <span>{formatBytes(used)} used</span>
          <span>{formatBytes(Math.max(total - used, 0))} free</span>
        </div>
      )}
    </div>
  );
}
