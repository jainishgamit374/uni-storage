import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ProviderGlyph } from "@/components/provider-glyph";
import { supabase } from "@/integrations/supabase/client";
import { commitUpload, planUpload } from "@/lib/nexdrive.functions";
import { uploadToGoogleDrive } from "@/lib/google.functions";
import { formatBytes } from "@/lib/format";
import { providerMeta } from "@/lib/providers";
import { useRefreshOverview } from "@/lib/use-overview";
import { cn } from "@/lib/utils";

type Stage =
  | { kind: "idle" }
  | { kind: "routing" }
  | { kind: "uploading"; provider: string; label: string; reason: string; pct: number }
  | { kind: "done"; provider: string; label: string; reason: string; real: boolean }
  | { kind: "error"; message: string };

export function UploadDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [folder, setFolder] = useState("/");
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  const plan = useServerFn(planUpload);
  const commit = useServerFn(commitUpload);
  const driveUpload = useServerFn(uploadToGoogleDrive);
  const refresh = useRefreshOverview();

  function reset() {
    setFile(null);
    setStage({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function run() {
    if (!file) return;
    setStage({ kind: "routing" });
    try {
      const plannedFolder = folder.trim() || "/";
      const planned = await plan({
        data: {
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          folderPath: plannedFolder,
        },
      });

      setStage({
        kind: "uploading",
        provider: planned.provider,
        label: planned.accountLabel,
        reason: planned.reason,
        pct: 8,
      });

      let storageKey = planned.storageKey;

      if (planned.transport === "drive") {
        const form = new FormData();
        form.append("file", file);
        form.append("jobId", planned.jobId);
        form.append("accountId", planned.accountId);
        form.append("folderPath", plannedFolder);
        const res = await driveUpload({ data: form });
        storageKey = res.fileId;
      } else if (planned.real) {
        const { error } = await supabase.storage
          .from(planned.bucket)
          .upload(planned.storageKey, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (error) throw new Error(error.message);
      } else {
        // Simulated adapter: stream progress without moving bytes.
        for (const pct of [24, 48, 72, 94]) {
          await new Promise((r) => setTimeout(r, 180));
          setStage((s) => (s.kind === "uploading" ? { ...s, pct } : s));
        }
      }

      setStage((s) => (s.kind === "uploading" ? { ...s, pct: 100 } : s));

      await commit({
        data: {
          jobId: planned.jobId,
          accountId: planned.accountId,
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          folderPath: plannedFolder,
          storageKey,
          real: planned.real,
        },
      });

      setStage({
        kind: "done",
        provider: planned.provider,
        label: planned.accountLabel,
        reason: planned.reason,
        real: planned.real,
      });
      await refresh();
      toast.success(`${file.name} routed to ${planned.accountLabel}`, {
        description: `Decided by ${planned.reason}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setStage({ kind: "error", message });
      toast.error("Upload failed", { description: message });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <UploadCloud /> Upload
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload a file</DialogTitle>
          <DialogDescription>
            The routing engine picks the destination account for you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <label
            htmlFor="nexdrive-file"
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface px-4 py-8 text-center transition-colors hover:border-primary/60",
              file && "border-primary/50",
            )}
          >
            <UploadCloud className="size-6 text-muted-foreground" />
            <span className="text-sm font-medium">
              {file ? file.name : "Choose a file or drop it here"}
            </span>
            <span className="text-numeric text-xs text-muted-foreground">
              {file ? formatBytes(file.size) : "Up to 50 MB on NexDrive Storage"}
            </span>
            <input
              id="nexdrive-file"
              ref={inputRef}
              type="file"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setStage({ kind: "idle" });
              }}
            />
          </label>

          <div className="space-y-2">
            <Label htmlFor="nexdrive-folder">Destination folder</Label>
            <Input
              id="nexdrive-folder"
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="/clients/acme"
              className="text-numeric"
            />
          </div>

          {stage.kind === "routing" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Resolving destination…
            </p>
          )}

          {stage.kind === "uploading" && (
            <div className="space-y-2 rounded-lg border border-border bg-surface p-3">
              <div className="flex items-center gap-2">
                <ProviderGlyph provider={stage.provider} size="sm" />
                <span className="text-sm font-medium">{stage.label}</span>
                <span className="text-numeric ml-auto text-xs text-muted-foreground">
                  {stage.pct}%
                </span>
              </div>
              <Progress value={stage.pct} />
              <p className="text-xs text-muted-foreground">Routed by {stage.reason}</p>
            </div>
          )}

          {stage.kind === "done" && (
            <div className="flex items-start gap-2 rounded-lg border border-success/40 bg-surface p-3 text-sm">
              <CheckCircle2 className="mt-0.5 size-4 text-success" />
              <div>
                <p className="font-medium">
                  Stored on {stage.label} · {providerMeta(stage.provider).name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stage.real ? "Real object written" : "Simulated adapter"} · routed by{" "}
                  {stage.reason}
                </p>
              </div>
            </div>
          )}

          {stage.kind === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-surface p-3 text-sm">
              <CircleAlert className="mt-0.5 size-4 text-destructive" />
              <p>{stage.message}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            onClick={stage.kind === "done" ? reset : run}
            disabled={!file || stage.kind === "routing" || stage.kind === "uploading"}
          >
            {stage.kind === "done" ? "Upload another" : "Route & upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
