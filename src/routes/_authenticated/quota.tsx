import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { ProviderGlyph } from "@/components/provider-glyph";
import { QuotaBar } from "@/components/quota-bar";
import { Badge } from "@/components/ui/badge";
import { CardGridSkeleton, Shimmer } from "@/components/skeletons";
import { HintTip } from "@/components/hint-tip";
import { formatBytes } from "@/lib/format";
import { providerMeta } from "@/lib/providers";
import { useOverview } from "@/lib/use-overview";

export const Route = createFileRoute("/_authenticated/quota")({
  head: () => ({
    meta: [
      { title: "Quota — NexDrive gateway" },
      {
        name: "description",
        content: "Per-provider capacity, headroom and pooled storage across the gateway.",
      },
      { property: "og:title", content: "Quota — NexDrive gateway" },
      {
        property: "og:description",
        content: "See headroom on every backend before the router picks a destination.",
      },
    ],
  }),
  component: QuotaPage,
});

function QuotaPage() {
  const { data, isLoading } = useOverview();

  const total = (data?.accounts ?? []).reduce((s, a) => s + Number(a.quota_total), 0);
  const used = (data?.accounts ?? []).reduce((s, a) => s + Number(a.quota_used), 0);

  return (
    <AppShell title="Quota" description="Headroom per backend, and the pooled total.">
      <HintTip id="quota" title="Headroom drives the router" className="mb-4">
        In most-available mode the gateway always writes to the backend with the most free space.
        Bars turn amber past 70% and red past 90%.
      </HintTip>

      {isLoading ? (
        <div className="space-y-4">
          <Shimmer className="h-32 rounded-xl" />
          <CardGridSkeleton />
        </div>
      ) : (
        <>
          <div className="panel panel-interactive p-5">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Pooled storage</p>
            <p className="text-numeric mt-2 text-3xl font-semibold">
              {formatBytes(used)}{" "}
              <span className="text-lg text-muted-foreground">/ {formatBytes(total)}</span>
            </p>
            <QuotaBar className="mt-4" used={used} total={total} showLabels={false} />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {data!.accounts.map((a) => {
              const meta = providerMeta(a.provider);
              const free = Number(a.quota_total) - Number(a.quota_used);
              return (
                <div key={a.id} className="panel panel-interactive stagger-in p-5">
                  <div className="flex items-center gap-3">
                    <ProviderGlyph provider={a.provider} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.label}</p>
                      <p className="text-xs text-muted-foreground">{meta.name}</p>
                    </div>
                    <Badge variant={a.is_mock ? "outline" : "default"} className="text-[10px]">
                      {a.is_mock ? "mock" : "live"}
                    </Badge>
                  </div>
                  <QuotaBar
                    className="mt-4"
                    used={Number(a.quota_used)}
                    total={Number(a.quota_total)}
                  />
                  <p className="text-numeric mt-2 text-xs text-muted-foreground">
                    {formatBytes(free)} free · priority {a.priority}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}
    </AppShell>
  );
}
