import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Download,
  FolderInput,
  FolderSearch,
  Eye,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
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
import { EmptyState } from "@/components/empty-state";
import { HintTip } from "@/components/hint-tip";
import { TableSkeleton } from "@/components/skeletons";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { deleteFile, getDownloadUrl } from "@/lib/nexdrive.functions";
import { moveStoredFile, renameStoredFile } from "@/lib/google.functions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
  const rename = useServerFn(renameStoredFile);
  const move = useServerFn(moveStoredFile);

  const [edit, setEdit] = useState<{ id: string; mode: "rename" | "move"; value: string } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<{
    name: string;
    url: string;
    mimeType: string | null;
  } | null>(null);

  async function saveEdit() {
    if (!edit) return;
    setSaving(true);
    try {
      if (edit.mode === "rename") await rename({ data: { id: edit.id, name: edit.value.trim() } });
      else await move({ data: { id: edit.id, folderPath: edit.value.trim() || "/" } });
      await refresh();
      toast.success(edit.mode === "rename" ? "File renamed" : "File moved");
      setEdit(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  }

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

  async function onPreview(id: string, name: string) {
    try {
      const res = await download({ data: { id, inline: true } });
      if (res.mock || !res.url) {
        toast.info("Simulated adapter", {
          description: "Mock providers hold no bytes to preview.",
        });
        return;
      }
      setPreview({ name, url: res.url, mimeType: res.mimeType });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open preview");
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
      <HintTip id="files" title="One table, every provider" className="mb-4">
        Filter by provider or file type, then use the row menu to download or delete. Ask Nex, the
        assistant in the corner, to find anything by name, size or provider.
      </HintTip>

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
            <TableSkeleton rows={5} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={FolderSearch}
              title={data && data.files.length === 0 ? "Your gateway is empty" : "No files match"}
              description={
                data && data.files.length === 0
                  ? "Upload a file and the routing engine will place it on the best backend automatically."
                  : "Nothing matched these filters. Widen the file type or switch provider."
              }
              hints={["Route by file type", "Search across providers", "Ask Nex for a file"]}
            />
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
                    <tr key={f.id} className="row-interactive border-b border-border/60 last:border-0">
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
                            <DropdownMenuItem onClick={() => onPreview(f.id, f.name)}>
                              <Eye className="size-4" /> Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDownload(f.id)}>
                              <Download className="size-4" /> Download
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                setEdit({ id: f.id, mode: "rename", value: f.name })
                              }
                            >
                              <Pencil className="size-4" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                setEdit({ id: f.id, mode: "move", value: f.folder_path })
                              }
                            >
                              <FolderInput className="size-4" /> Move
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

      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{preview?.name}</DialogTitle>
          </DialogHeader>
          {preview &&
            (preview.mimeType?.startsWith("image/") ? (
              <img
                src={preview.url}
                alt={preview.name}
                className="max-h-[70vh] w-full rounded-lg object-contain"
              />
            ) : preview.mimeType?.startsWith("video/") ? (
              <video src={preview.url} controls className="max-h-[70vh] w-full rounded-lg" />
            ) : preview.mimeType?.startsWith("audio/") ? (
              <audio src={preview.url} controls className="w-full" />
            ) : (
              <iframe
                src={preview.url}
                title={preview.name}
                className="h-[70vh] w-full rounded-lg border border-border bg-surface"
              />
            ))}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPreview(null)}>
              Close
            </Button>
            <Button
              className="pill-action"
              onClick={() => preview && window.open(preview.url, "_blank", "noopener")}
            >
              Open in new tab
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{edit?.mode === "rename" ? "Rename file" : "Move file"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="file-edit-value">
              {edit?.mode === "rename" ? "New name" : "Destination folder"}
            </Label>
            <Input
              id="file-edit-value"
              value={edit?.value ?? ""}
              onChange={(e) => setEdit((s) => (s ? { ...s, value: e.target.value } : s))}
              className={edit?.mode === "move" ? "text-numeric" : undefined}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit} disabled={saving || !edit?.value.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
