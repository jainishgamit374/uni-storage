import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Database, Files, Route as RouteIcon, Zap } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ProviderGlyph } from "@/components/provider-glyph";
import { QuotaBar } from "@/components/quota-bar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes, formatRelative } from "@/lib/format";
import { ROUTING_MODES, providerMeta } from "@/lib/providers";
import { useOverview } from "@/lib/use-overview";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — NexDrive gateway" },
      {
        name: "description",
        content:
          "Live view of every connected storage provider: capacity, routed uploads and recent files.",
      },
      { property: "og:title", content: "Overview — NexDrive gateway" },
      {
        property: "og:description",
        content: "Live view of every connected storage provider in one console.",
      },
    ],
  }),
  component: DashboardPage,
});

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  compact,
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Zap;
  compact?: boolean;
}) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="size-4 text-primary" />
      </div>
      <p className={compact ? "mt-3 text-lg font-semibold" : "text-numeric mt-3 text-2xl font-semibold"}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function DashboardPage() {
  const { data, isLoading } = useOverview();

  if (isLoading || !data) {
    return (
      <AppShell title="Overview" description="Loading gateway state…">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </AppShell>
    );
  }

  const totalCapacity = data.accounts.reduce((sum, a) => sum + Number(a.quota_total), 0);
  const totalUsed = data.accounts.reduce((sum, a) => sum + Number(a.quota_used), 0);
  const mode = ROUTING_MODES.find((m) => m.id === data.policy.mode);

  return (
    <AppShell
      title="Overview"
      description="One gateway across every storage backend you've connected."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Pooled capacity"
          value={formatBytes(totalCapacity)}
          hint={`${data.accounts.length} connected accounts`}
          icon={Database}
        />
        <StatTile
          label="Used"
          value={formatBytes(totalUsed)}
          hint={`${totalCapacity ? ((totalUsed / totalCapacity) * 100).toFixed(1) : "0"}% of pool`}
          icon={Zap}
        />
        <StatTile
          label="Files"
          value={String(data.files.length)}
          hint="Indexed across all providers"
          icon={Files}
        />
        <StatTile
          label="Routing mode"
          value={mode?.name ?? data.policy.mode}
          hint={mode?.blurb ?? "Custom policy"}
          icon={RouteIcon}
          compact
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <section className="panel p-4 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Connected accounts</h2>
            <Link
              to="/settings/providers"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              Manage <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <ul className="mt-4 space-y-4">
            {data.accounts.map((a) => (
              <li key={a.id} className="flex items-start gap-3">
                <ProviderGlyph provider={a.provider} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{a.label}</p>
                    <Badge variant={a.is_mock ? "outline" : "default"} className="text-[10px]">
                      {a.is_mock ? "mock adapter" : "live"}
                    </Badge>
                    <span className="text-numeric ml-auto text-xs text-muted-foreground">
                      {formatBytes(Number(a.quota_used))} / {formatBytes(Number(a.quota_total))}
                    </span>
                  </div>
                  <QuotaBar
                    className="mt-2"
                    showLabels={false}
                    used={Number(a.quota_used)}
                    total={Number(a.quota_total)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent files</h2>
            <Link
              to="/files"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              All files <ArrowUpRight className="size-3" />
            </Link>
          </div>
          {data.files.length === 0 ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Nothing stored yet. Use Upload to send your first file through the router.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {data.files.slice(0, 7).map((f) => {
                const account = data.accounts.find((a) => a.id === f.account_id);
                return (
                  <li key={f.id} className="flex items-center gap-3">
                    <ProviderGlyph provider={account?.provider ?? "s3"} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{f.name}</p>
                      <p className="text-numeric text-xs text-muted-foreground">
                        {formatBytes(Number(f.size))} ·{" "}
                        {providerMeta(account?.provider ?? "s3").name}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(f.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}
