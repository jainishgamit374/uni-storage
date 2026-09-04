import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  clearGoogleOauthConfig,
  getGoogleOauthConfig,
  saveGoogleOauthConfig,
} from "@/backend/api/google-config.functions";

export const Route = createFileRoute("/_authenticated/settings/oauth")({
  head: () => ({
    meta: [
      { title: "Google OAuth — NexDrive gateway" },
      {
        name: "description",
        content:
          "Configure the shared Google OAuth application once; every NexDrive user then connects their own Drive accounts.",
      },
      { property: "og:title", content: "Google OAuth — NexDrive gateway" },
      {
        property: "og:description",
        content: "Administrator setup for the workspace-wide Google OAuth application.",
      },
    ],
  }),
  component: OauthSettingsPage,
});

function OauthSettingsPage() {
  const load = useServerFn(getGoogleOauthConfig);
  const save = useServerFn(saveGoogleOauthConfig);
  const clear = useServerFn(clearGoogleOauthConfig);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["google-oauth-config"],
    queryFn: () => load({ data: undefined }),
    retry: false,
  });

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");

  const saving = useMutation({
    mutationFn: () =>
      save({ data: { clientId, clientSecret, redirectUri: redirectUri || undefined } }),
    onSuccess: () => {
      setClientId("");
      setClientSecret("");
      toast.success("Google OAuth configured");
      void qc.invalidateQueries({ queryKey: ["google-oauth-config"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not save the configuration"),
  });

  const clearing = useMutation({
    mutationFn: () => clear({ data: undefined }),
    onSuccess: () => {
      toast.success("Google OAuth configuration removed");
      void qc.invalidateQueries({ queryKey: ["google-oauth-config"] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not remove the configuration"),
  });

  const effectiveRedirect = redirectUri || data?.redirectUri || data?.defaultRedirectUri || "";

  if (error) {
    return (
      <AppShell title="Google OAuth" description="Workspace-wide OAuth application.">
        <div className="panel flex items-start gap-3 p-6">
          <ShieldAlert className="mt-0.5 size-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Administrators only</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask a NexDrive administrator to configure Google OAuth. Once it is set up, you connect
              your own Drive accounts from Providers — no client credentials needed.
            </p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Google OAuth"
      description="Configure the shared Google application once. Users then just click Connect."
    >
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="panel p-6">
            <div className="flex items-center gap-3">
              <h2 className="text-sm font-semibold">OAuth configuration</h2>
              {data?.configured ? (
                <Badge variant="primary" className="text-[10px]">
                  <CheckCircle2 className="size-3" /> configured
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">
                  <TriangleAlert className="size-3" /> not configured
                </Badge>
              )}
            </div>
            {data?.configured && (
              <p className="mt-2 text-numeric text-xs text-muted-foreground">
                Current client: {data.clientIdMasked}
                {data.source === "env" ? " (from project secrets)" : ""}
              </p>
            )}

            <div className="mt-5 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="client-id">Client ID</Label>
                <Input
                  id="client-id"
                  autoComplete="off"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="1234567890-abcdefg.apps.googleusercontent.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="client-secret">Client Secret</Label>
                <Input
                  id="client-secret"
                  type="password"
                  autoComplete="new-password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="••••••••••••••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="redirect-uri">Redirect URI</Label>
                <Input
                  id="redirect-uri"
                  value={redirectUri}
                  onChange={(e) => setRedirectUri(e.target.value)}
                  placeholder={data?.defaultRedirectUri}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use this app's default callback.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <Button
                onClick={() => saving.mutate()}
                disabled={saving.isPending || clientId.trim().length < 10 || clientSecret.length < 6}
              >
                {saving.isPending ? "Saving…" : "Save configuration"}
              </Button>
              {data?.configured && data.source === "database" && (
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => clearing.mutate()}
                  disabled={clearing.isPending}
                >
                  Remove configuration
                </Button>
              )}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              The secret is encrypted before it is stored and is never sent back to the browser.
            </p>
          </section>

          <aside className="panel p-6">
            <h2 className="text-sm font-semibold">Register this callback</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              Add it as an authorised redirect URI on your Google Cloud OAuth client.
            </p>
            <code className="text-numeric mt-3 block break-all rounded-md bg-muted p-3 text-xs">
              {effectiveRedirect}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                void navigator.clipboard.writeText(effectiveRedirect);
                toast.success("Redirect URI copied");
              }}
            >
              <Copy className="size-4" /> Copy
            </Button>
            <ol className="mt-5 space-y-2 text-xs text-muted-foreground">
              <li>1. Enable the Google Drive API in your Google Cloud project.</li>
              <li>2. Configure the OAuth consent screen and add your test users.</li>
              <li>
                3. Create a Web application OAuth client and paste the redirect URI above.
              </li>
              <li>4. Save the Client ID and Secret here — users never see them.</li>
            </ol>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
