import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { updatePolicy } from "@/backend/api/nexdrive.functions";
import { ROUTING_MODES, type FolderRule, type TypeRule } from "@/lib/providers";
import { cn } from "@/lib/utils";
import { useOverview, useRefreshOverview } from "@/lib/use-overview";

export const Route = createFileRoute("/_authenticated/settings/policy")({
  head: () => ({
    meta: [
      { title: "Routing policy — NexDrive gateway" },
      {
        name: "description",
        content:
          "Build upload routing rules: most-available, round robin, priority, file-type and folder rules.",
      },
      { property: "og:title", content: "Routing policy — NexDrive gateway" },
      {
        property: "og:description",
        content: "Decide which backend receives each upload with a visual rule builder.",
      },
    ],
  }),
  component: PolicyPage,
});

function PolicyPage() {
  const { data, isLoading } = useOverview();
  const refresh = useRefreshOverview();
  const save = useServerFn(updatePolicy);

  const [mode, setMode] = useState<string>("most-available");
  const [typeRules, setTypeRules] = useState<TypeRule[]>([]);
  const [folderRules, setFolderRules] = useState<FolderRule[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setMode(data.policy.mode);
    setTypeRules((data.policy.type_rules as TypeRule[]) ?? []);
    setFolderRules((data.policy.folder_rules as FolderRule[]) ?? []);
  }, [data]);

  const accounts = data?.accounts ?? [];

  async function onSave() {
    setBusy(true);
    try {
      await save({
        data: {
          mode,
          typeRules: typeRules.filter((r) => r.match && r.accountId),
          folderRules: folderRules.filter((r) => r.prefix && r.accountId),
        },
      });
      await refresh();
      toast.success("Routing policy saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <AppShell title="Routing policy" description="Loading…">
        <Skeleton className="h-72" />
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Routing policy"
      description="The engine evaluates rules first, then falls back to the selected mode."
      actions={
        <Button variant="outline" onClick={onSave} disabled={busy}>
          {busy ? "Saving…" : "Save policy"}
        </Button>
      }
    >
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {ROUTING_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              "panel p-4 text-left transition-colors hover:border-primary/60",
              mode === m.id && "border-primary ring-1 ring-primary/40",
            )}
          >
            <p className="text-sm font-medium">{m.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{m.blurb}</p>
          </button>
        ))}
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">File-type rules</h2>
              <p className="text-xs text-muted-foreground">
                Match an extension (.mp4) or MIME prefix (image/).
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setTypeRules((r) => [...r, { match: "", accountId: accounts[0]?.id ?? "" }])
              }
            >
              <Plus className="size-4" /> Rule
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {typeRules.length === 0 && (
              <p className="text-sm text-muted-foreground">No type rules yet.</p>
            )}
            {typeRules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 space-y-1">
                  <Label className="sr-only">Match</Label>
                  <Input
                    value={rule.match}
                    placeholder=".mp4"
                    onChange={(e) =>
                      setTypeRules((rules) =>
                        rules.map((r, j) => (j === i ? { ...r, match: e.target.value } : r)),
                      )
                    }
                  />
                </div>
                <Select
                  value={rule.accountId}
                  onValueChange={(v) =>
                    setTypeRules((rules) =>
                      rules.map((r, j) => (j === i ? { ...r, accountId: v } : r)),
                    )
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTypeRules((rules) => rules.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Folder rules</h2>
              <p className="text-xs text-muted-foreground">
                Anything under a prefix goes to one backend.
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setFolderRules((r) => [...r, { prefix: "/", accountId: accounts[0]?.id ?? "" }])
              }
            >
              <Plus className="size-4" /> Rule
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {folderRules.length === 0 && (
              <p className="text-sm text-muted-foreground">No folder rules yet.</p>
            )}
            {folderRules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={rule.prefix}
                  placeholder="/clients/"
                  className="flex-1"
                  onChange={(e) =>
                    setFolderRules((rules) =>
                      rules.map((r, j) => (j === i ? { ...r, prefix: e.target.value } : r)),
                    )
                  }
                />
                <Select
                  value={rule.accountId}
                  onValueChange={(v) =>
                    setFolderRules((rules) =>
                      rules.map((r, j) => (j === i ? { ...r, accountId: v } : r)),
                    )
                  }
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFolderRules((rules) => rules.filter((_, j) => j !== i))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
