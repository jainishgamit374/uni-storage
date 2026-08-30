import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, GitBranch, Layers, ShieldCheck } from "lucide-react";

import { ProviderGlyph } from "@/components/provider-glyph";
import { Button } from "@/components/ui/button";
import { PROVIDERS, ROUTING_MODES } from "@/lib/providers";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NexDrive — universal storage gateway" },
      {
        name: "description",
        content:
          "Pool Google Drive, Dropbox, OneDrive, R2, B2, Wasabi and S3 behind one API with smart upload routing.",
      },
      { property: "og:title", content: "NexDrive — universal storage gateway" },
      {
        property: "og:description",
        content: "One gateway, every storage backend, smart routing per file type and folder.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Layers,
    title: "One adapter interface",
    body: "Every backend implements the same StorageProvider contract: quota, list, stream upload, delete, signed download.",
  },
  {
    icon: GitBranch,
    title: "Five routing modes",
    body: "Most-available, round robin, priority order, plus file-type and folder rules built in a visual policy editor.",
  },
  {
    icon: ShieldCheck,
    title: "Row-level isolation",
    body: "Files, accounts and jobs are scoped to your user by database policies — no shared buckets, no leaks.",
  },
];

function Landing() {
  return (
    <div className="grid-backdrop min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6">
        <div className="flex items-center gap-2.5">
          <span className="text-numeric flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            N
          </span>
          <span className="font-semibold tracking-tight">NexDrive</span>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24">
        <section className="py-16 sm:py-24">
          <p className="text-numeric text-xs uppercase tracking-[0.2em] text-primary">
            universal storage gateway
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Every cloud drive you own, behind a single upload endpoint.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            NexDrive pools Google Drive, Dropbox, OneDrive, R2, B2, Wasabi, MinIO and any
            S3-compatible endpoint, then routes each upload to the right backend by quota, file
            type or folder.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                Open the console <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>

          <div className="mt-12 flex flex-wrap gap-3">
            {PROVIDERS.map((p) => (
              <div
                key={p.id}
                className="panel flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground"
              >
                <ProviderGlyph provider={p.id} size="sm" />
                {p.name}
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="panel p-5">
              <Icon className="size-5 text-primary" />
              <h2 className="mt-4 text-base font-semibold">{title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <section className="mt-16">
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground">
            Routing engine
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ROUTING_MODES.map((m) => (
              <div key={m.id} className="panel p-4">
                <p className="text-numeric text-xs text-primary">{m.id}</p>
                <p className="mt-2 text-sm font-medium">{m.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{m.blurb}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
