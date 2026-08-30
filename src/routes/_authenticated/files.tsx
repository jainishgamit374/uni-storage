import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Download, MoreHorizontal, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ProviderGlyph } from "@/components/provider-glyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteFile, getDownloadUrl } from "@/lib/nexdrive.functions";
import { fileKind, formatBytes, formatRelative } from "@/lib/format";
import { providerMeta } from "@/lib/providers";
import { useOverview, useRefreshOverview } from "@/lib/use-overview";

export const Route = createFileRoute("/_authenticated/files")({
  head: () => ({
    meta: [
      { title: "Files — NexDrive gateway" },
      {
        name: "description",
        content: "Unified file manager across Google Drive, Dropbox, R2, B2 and S3 endpoints.",
      },
      { property: "og:title", content: "Files — NexDrive gateway" },
      {
        property: "og:description",
        content: "Search and manage every file across every connected storage provider.",
      },
    ],
  }),
  component: FilesPage,
});

const KINDS = ["all", "document", "image", "video", "audio", "archive", "other"] as const;

function FilesPage() {
  const { data, isLoading } = useOverview();
  const refresh = useRefreshOverview();
  const remove = useServerFn(deleteFile);
  const download = useServerFn(getDownloadUrl);

  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [accountFilter, setAccountFilter] = useState("all");

  const rows = useMemo(() => {
    if (!data) return [];
    return data.files.filter((f) => {
      if (accountFilter !== "all" && f.account_id !== accountFilter) return false;
      if (kind !== "all" && fileKind(f.mime_type, f.name) !== kind) return false;
      if (query && !`${f.name} ${f.folder_path}`.toLowerCase().includes(query.toLowerCase()))
        return false;
      return true;
    });
  }, [data, query, kind, accountFilter]);

  async function onDownload(id: string) {
    try {
      const res = await download({ data: { id } });
      if (res.mock || !res.url) {
        toast.info("Simulated adapter", {
          description: "This file lives on a mock provider — connect real credentials to fetch it.",
        });
        return;
      }
      window.open(res.url, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create download link");
    }
  }

  async function onDelete(id: string, name: string) {
    try {
      await remove({ data: { id } });
      await refresh();
      toast.success(`${name} deleted`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <AppShell title="Files" description="Every object the gateway knows about, in one table.">
      <div className="panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search across all providers…"
              className="pl-9"
            />
          </div>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="All providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {(data?.accounts ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Tabs value={kind} onValueChange={setKind} className="mt-4">
          <TabsList>
            {KINDS.map((k) => (
              <TabsTrigger key={k} value={k} className="capitalize">
                {k}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mt-4 overflow-x-auto">
          {isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No files match these filters.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Provider</th>
                  <th className="pb-2 font-medium">Folder</th>
                  <th className="pb-2 text-right font-medium">Size</th>
                  <th className="pb-2 text-right font-medium">Added</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const account = data?.accounts.find((a) => a.id === f.account_id);
                  const provider = account?.provider ?? "s3";
                  return (
                    <tr key={f.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{f.name}</span>
                          {f.is_mock && (
                            <Badge variant="outline" className="text-[10px]">
                              mock
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <ProviderGlyph provider={provider} size="sm" />
                          <span className="text-muted-foreground">
                            {providerMeta(provider).name}
                          </span>
                        </div>
                      </td>
                      <td className="text-numeric py-3 pr-4 text-muted-foreground">
                        {f.folder_path}
                      </td>
                      <td className="text-numeric py-3 pr-4 text-right">
                        {formatBytes(Number(f.size))}
                      </td>
                      <td className="py-3 pr-4 text-right text-muted-foreground">
                        {formatRelative(f.created_at)}
                      </td>
                      <td className="py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="size-4" />
                              <span className="sr-only">Actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onDownload(f.id)}>
                              <Download className="size-4" /> Download
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => onDelete(f.id, f.name)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="size-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
