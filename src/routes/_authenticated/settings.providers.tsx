import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, RefreshCw, TriangleAlert, Unplug } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ProviderGlyph } from "@/components/provider-glyph";
import { QuotaBar } from "@/components/quota-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBytes } from "@/lib/format";
import { connectAccount, disconnectAccount } from "@/lib/nexdrive.functions";
import { startGoogleConnect, syncGoogleQuota } from "@/lib/google.functions";
import { PROVIDERS, providerTint, type ProviderMeta } from "@/lib/providers";
import { useOverview, useRefreshOverview } from "@/lib/use-overview";

export const Route = createFileRoute("/_authenticated/settings/providers")({
  head: () => ({
    meta: [
      { title: "Providers — NexDrive gateway" },
      {
        name: "description",
        content:
          "Connect Google Drive, Dropbox, OneDrive, R2, B2, Wasabi, MinIO or any S3 endpoint.",
      },
      { property: "og:title", content: "Providers — NexDrive gateway" },
      {
        property: "og:description",
        content: "Add and manage the storage backends behind your gateway.",
      },
    ],
  }),
  component: ProvidersPage,
});

function ProvidersPage() {
  const { data, isLoading } = useOverview();
  const refresh = useRefreshOverview();
  const connect = useServerFn(connectAccount);
  const disconnect = useServerFn(disconnectAccount);
  const beginGoogle = useServerFn(startGoogleConnect);
  const syncQuota = useServerFn(syncGoogleQuota);
  const router = useRouter();
  const [syncing, setSyncing] = useState<string | null>(null);

  // Surface the outcome of the Google OAuth round-trip, then clean the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("google");
    if (!outcome) return;
    if (outcome === "connected") {
      toast.success(
        `Google Drive connected${params.get("email") ? ` — ${params.get("email")}` : ""}`,
      );
      void refresh();
    } else {
      toast.error("Google Drive connection failed", {
        description: params.get("message") ?? undefined,
      });
    }
    window.history.replaceState({}, "", window.location.pathname);
    void router.invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connectGoogle() {
    try {
      const { url } = await beginGoogle({ data: undefined });
      window.location.href = url;
    } catch (err) {
      toast.error("Cannot start Google sign-in", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function onSyncQuota(id: string) {
    setSyncing(id);
    try {
      const res = await syncQuota({ data: { accountId: id } });
      await refresh();
      if (res.ok) toast.success("Drive quota synced");
      else toast.warning("This Google account needs to be reconnected.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Quota sync failed");
    } finally {
      setSyncing(null);
    }
  }

  const [target, setTarget] = useState<ProviderMeta | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  function openConnect(meta: ProviderMeta) {
    if (meta.id === "google-drive") {
      void connectGoogle();
      return;
    }
    setTarget(meta);
    setLabel(meta.name);
  }

  async function submit() {
    if (!target) return;
    setBusy(true);
    try {
      await connect({
        data: {
          provider: target.id,
          label: label.trim() || target.name,
          quotaTotal: target.defaultQuota,
          config: {},
        },
      });
      await refresh();
      toast.success(`${target.name} connected`);
      setTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    try {
      await disconnect({ data: { id } });
      await refresh();
      toast.success(`${name} disconnected`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    }
  }

  return (
    <AppShell
      title="Providers"
      description="Each backend sits behind the same StorageProvider adapter interface."
    >
      <section>
        <h2 className="text-sm font-semibold">Connected</h2>
        {isLoading ? (
          <Skeleton className="mt-3 h-40" />
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data!.accounts.map((a) => (
              <div
                key={a.id}
                className="panel-interactive overflow-hidden rounded-3xl border border-border bg-card shadow-panel"
              >
                <div
                  className="tint-field relative flex h-32 items-center justify-center"
                  style={{ "--tint": `var(${providerTint(a.provider)})` } as React.CSSProperties}
                >
                  <ProviderGlyph
                    provider={a.provider}
                    size="lg"
                    className="size-16 rounded-2xl border-border/60 bg-surface/85 text-foreground shadow-panel backdrop-blur [&_svg]:size-7"
                  />
                  <span className="absolute left-3 top-3">
                    {a.needs_reauth ? (
                      <Badge variant="danger" className="text-[10px]">
                        <TriangleAlert className="size-3" /> reauth
                      </Badge>
                    ) : (
                      <Badge
                        variant={a.is_mock ? "outline" : "primary"}
                        className="bg-surface/85 text-[10px] backdrop-blur"
                      >
                        {a.is_mock ? "mock" : "live"}
                      </Badge>
                    )}
                  </span>
                  {a.provider === "google-drive" && !a.is_mock && (
                    <button
                      type="button"
                      aria-label="Sync quota"
                      disabled={syncing === a.id}
                      onClick={() => onSyncQuota(a.id)}
                      className="transition-base absolute right-3 top-3 flex size-8 items-center justify-center rounded-full border border-border/60 bg-surface/85 text-muted-foreground backdrop-blur hover:-translate-y-px hover:text-foreground disabled:opacity-50"
                    >
                      <RefreshCw className={syncing === a.id ? "size-4 animate-spin" : "size-4"} />
                    </button>
                  )}
                </div>
                <div className="p-5 pt-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold tracking-tight">{a.label}</p>
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span
                          aria-hidden="true"
                          className={
                            a.needs_reauth
                              ? "size-1.5 rounded-full bg-warning"
                              : a.is_mock
                                ? "size-1.5 rounded-full bg-muted-foreground/50"
                                : "size-1.5 rounded-full bg-success"
                          }
                        />
                        {a.needs_reauth
                          ? "Needs reconnect"
                          : a.is_mock
                            ? `Simulated · priority ${a.priority}`
                            : `Online · ${a.status}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="pill-action shrink-0"
                      onClick={() => remove(a.id, a.label)}
                    >
                      <Unplug className="size-3.5" /> Disconnect
                    </button>
                  </div>
                  <QuotaBar
                    className="mt-4"
                    used={Number(a.quota_used)}
                    total={Number(a.quota_total)}
                  />
                  {a.needs_reauth && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => connectGoogle()}
                    >
                      Reconnect Google Drive
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">Available adapters</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {PROVIDERS.map((p) => (
            <div
              key={p.id}
              className="panel-interactive flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-panel"
            >
              <div
                className="tint-field relative flex h-28 items-center justify-center"
                style={{ "--tint": `var(${providerTint(p.id)})` } as React.CSSProperties}
              >
                <ProviderGlyph
                  provider={p.id}
                  size="lg"
                  className="size-14 rounded-2xl border-border/60 bg-surface/85 text-foreground shadow-panel backdrop-blur [&_svg]:size-6"
                />
                <span className="absolute left-3 top-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {p.kind}
                </span>
              </div>
              <div className="flex flex-1 flex-col p-5 pt-4">
                <p className="truncate text-base font-semibold tracking-tight">{p.name}</p>
                <p className="mt-1.5 line-clamp-2 flex-1 text-sm text-muted-foreground">
                  {p.blurb}
                </p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <span className="text-numeric text-xs text-muted-foreground">
                    {formatBytes(p.defaultQuota)} default
                  </span>
                  <button type="button" className="pill-action shrink-0" onClick={() => openConnect(p)}>
                    <Plus className="size-3.5" /> Connect
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect {target?.name}</DialogTitle>
            <DialogDescription>
              {target?.real
                ? "This adapter writes real bytes through the gateway."
                : "Simulated adapter: the routing engine treats it as a real destination, but bytes are not transferred."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="account-label">Label</Label>
            <Input
              id="account-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Google Drive — work"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
