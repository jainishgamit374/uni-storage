import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, CircleAlert, Loader2, UploadCloud } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { ProviderGlyph } from "@/components/provider-glyph";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/empty-state";
import { HintTip } from "@/components/hint-tip";
import { TableSkeleton } from "@/components/skeletons";
import { formatBytes, formatRelative } from "@/lib/format";
import { useOverview } from "@/lib/use-overview";

export const Route = createFileRoute("/_authenticated/uploads")({
  head: () => ({
    meta: [
      { title: "Upload history — NexDrive gateway" },
      {
        name: "description",
        content: "Every routed upload with its destination provider, routing reason and status.",
      },
      { property: "og:title", content: "Upload history — NexDrive gateway" },
      {
        property: "og:description",
        content: "Audit which provider received each upload and why.",
      },
    ],
  }),
  component: UploadsPage,
});

function StatusPill({ status }: { status: string }) {
  if (status === "complete")
    return (
      <Badge className="gap-1 bg-success text-success-foreground">
        <CheckCircle2 className="size-3" /> complete
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="destructive" className="gap-1">
        <CircleAlert className="size-3" /> failed
      </Badge>
    );
  return (
    <Badge variant="outline" className="gap-1">
      <Loader2 className="size-3 animate-spin" /> {status}
    </Badge>
  );
}

function UploadsPage() {
  const { data, isLoading } = useOverview();

  return (
    <AppShell title="Uploads" description="Routing decisions, byte counts and outcomes.">
      <HintTip id="uploads" title="See why each file landed where it did" className="mb-4">
        Every row shows the destination backend and the rule that chose it. Change the rules any
        time under Routing policy.
      </HintTip>

      <div className="panel divide-y divide-border">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={4} />
          </div>
        ) : (data?.jobs.length ?? 0) === 0 ? (
          <EmptyState
            icon={UploadCloud}
            title="No routed uploads yet"
            description="Send your first file through the gateway and the routing decision will be logged here."
            hints={["Most-available", "Round-robin", "File-type rules"]}
          />
        ) : (
          data!.jobs.map((job) => {
            const account = data!.accounts.find((a) => a.id === job.account_id);
            return (
              <div key={job.id} className="row-interactive flex flex-wrap items-center gap-3 p-4">
                <ProviderGlyph provider={account?.provider ?? "s3"} />
                <div className="min-w-48 flex-1">
                  <p className="truncate text-sm font-medium">{job.file_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {account?.label ?? "Unassigned"} · routed by {job.routed_by ?? "policy"}
                  </p>
                </div>
                <span className="text-numeric text-xs text-muted-foreground">
                  {formatBytes(Number(job.size))}
                </span>
                <div className="w-32">
                  <Progress value={job.progress} />
                </div>
                <StatusPill status={job.status} />
                <span className="text-xs text-muted-foreground">
                  {formatRelative(job.created_at)}
                </span>
                {job.error && (
                  <p className="w-full text-xs text-destructive">{job.error}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </AppShell>
  );
}
