import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ProviderGlyph } from "@/components/provider-glyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { googleOauthStatus, startGoogleConnect } from "@/lib/google.functions";

export const Route = createFileRoute("/_authenticated/settings/connect/google")({
  head: () => ({
    meta: [
      { title: "Grant Google Drive access — NexDrive" },
      {
        name: "description",
        content:
          "Review exactly what NexDrive can do inside your Google Drive before granting access.",
      },
      { property: "og:title", content: "Grant Google Drive access — NexDrive" },
      {
        property: "og:description",
        content: "A full consent screen for connecting a Google Drive account to NexDrive.",
      },
    ],
  }),
  component: GoogleConsentPage,
});

const GRANTS = [
  {
    title: "Create a single NexDrive folder",
    body: "Every file the gateway routes to this account lands inside a folder named nexdrive.",
  },
  {
    title: "Upload, rename, move and delete files it manages",
    body: "Actions you take in the NexDrive file manager are mirrored to Drive.",
  },
  {
    title: "Read your storage quota",
    body: "Used and total bytes are read so the quota page can balance routing.",
  },
  {
    title: "Read your name and email address",
    body: "Only used to label the connected account so you can tell several Drives apart.",
  },
];

function GoogleConsentPage() {
  const router = useRouter();
  const statusFn = useServerFn(googleOauthStatus);
  const begin = useServerFn(startGoogleConnect);
  const [redirecting, setRedirecting] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["google-oauth-status"],
    queryFn: () => statusFn({ data: undefined }),
  });

  async function allow() {
    setRedirecting(true);
    try {
      const { url } = await begin({ data: undefined });
      window.location.href = url;
    } catch (err) {
      setRedirecting(false);
      toast.error("Cannot start Google sign-in", {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <AppShell
      title="Connect Google Drive"
      description="Review the access NexDrive is asking for, then continue to Google."
    >
      <div className="mx-auto max-w-2xl">
        <Link
          to="/settings/providers"
          className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to providers
        </Link>

        <div className="panel overflow-hidden">
          <div className="tint-field flex items-center gap-4 p-6" data-tint="sky">
            <ProviderGlyph provider="google-drive" size="lg" />
            <div>
              <h2 className="font-display text-2xl leading-tight">Google Drive</h2>
              <p className="text-sm text-muted-foreground">
                NexDrive will act inside your Drive on your behalf.
              </p>
            </div>
          </div>

          <div className="space-y-5 p-6">
            <ul className="space-y-4">
              {GRANTS.map((g) => (
                <li key={g.title} className="flex gap-3">
                  <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <Check className="size-3.5" />
                  </span>
                  <div>
                    <p className="font-medium leading-tight">{g.title}</p>
                    <p className="text-sm text-muted-foreground">{g.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>
                Tokens are encrypted before storage and never reach the browser. You can revoke
                access any time from Settings → Providers, which also revokes the token at Google.
              </p>
            </div>

            {status?.redirectUri && (
              <p className="text-numeric break-all text-xs text-muted-foreground">
                Redirect URI: {status.redirectUri}
              </p>
            )}

            {!isLoading && status && !status.configured && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
                Google OAuth is not configured yet.{" "}
                {status.isAdmin ? (
                  <Link to="/settings/oauth" className="underline">
                    Add the Client ID and Secret
                  </Link>
                ) : (
                  "Ask an administrator to add the Client ID and Secret."
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Badge variant="outline">You can connect several Google accounts</Badge>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => router.navigate({ to: "/settings/providers" })}>
                  Cancel
                </Button>
                <Button
                  className="pill-action"
                  onClick={allow}
                  disabled={redirecting || isLoading || !status?.configured}
                >
                  {redirecting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Redirecting…
                    </>
                  ) : (
                    "Allow and continue to Google"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
