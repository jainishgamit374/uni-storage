import {
  Boxes,
  CloudCog,
  Database,
  HardDrive,
  Layers,
  Server,
  Triangle,
  Waves,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { providerMeta } from "@/lib/providers";

const ICONS: Record<string, LucideIcon> = {
  nexdrive: Zap,
  "google-drive": Triangle,
  dropbox: Boxes,
  onedrive: CloudCog,
  r2: Layers,
  b2: Database,
  wasabi: Waves,
  minio: Server,
  s3: HardDrive,
};

export function ProviderGlyph({
  provider,
  className,
  size = "md",
}: {
  provider: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const Icon = ICONS[provider] ?? HardDrive;
  const meta = providerMeta(provider);
  return (
    <span
      title={meta.name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised text-muted-foreground",
        meta.real && "border-primary/40 text-primary",
        size === "sm" && "size-6",
        size === "md" && "size-9",
        size === "lg" && "size-11",
        className,
      )}
    >
      <Icon className={cn(size === "sm" ? "size-3.5" : size === "md" ? "size-4.5" : "size-5")} />
    </span>
  );
}
