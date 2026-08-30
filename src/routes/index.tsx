import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, GitBranch, Layers, ShieldCheck } from "lucide-react";

import { ProviderGlyph } from "@/components/provider-glyph";
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

const STATS = [
  { value: "8", label: "Storage backends" },
  { value: "5", label: "Routing modes" },
  { value: "1", label: "Upload endpoint" },
  { value: "100%", label: "Row-level scoped" },
];

function LimeButton({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-full bg-lime px-5 py-2.5 text-sm font-medium text-lime-foreground transition-transform hover:-translate-y-0.5"
    >
      {children}
      <span className="flex size-5 items-center justify-center rounded-full bg-lime-foreground/15">
        <ArrowRight className="size-3" />
      </span>
    </Link>
  );
}

function Landing() {
  return (
    <div className="min-h-screen bg-background px-3 py-3 sm:px-5 sm:py-5">
      {/* HERO BLOCK */}
      <section className="blue-field relative overflow-hidden rounded-3xl px-5 pb-8 pt-5 sm:px-9 sm:pb-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-numeric flex size-8 items-center justify-center rounded-full bg-ink-foreground text-sm font-bold text-primary">
              N
            </span>
            <span className="text-lg font-semibold tracking-tight">NexDrive™</span>
          </div>
          <nav className="hidden items-center gap-7 text-sm opacity-80 md:flex">
            <span>Adapters</span>
            <span>Routing</span>
            <span>Console</span>
            <span>Security</span>
          </nav>
          <Link
            to="/auth"
            className="pill border-ink-foreground/30 text-ink-foreground hover:bg-ink-foreground/10"
          >
            Sign in <ArrowUpRight className="size-3" />
          </Link>
        </header>

        <div className="mt-20 max-w-2xl sm:mt-28">
          <p className="text-numeric text-[11px] uppercase tracking-[0.24em] opacity-70">
            Universal storage gateway
          </p>
          <p className="mt-4 text-xl leading-snug sm:text-2xl">
            One endpoint that doesn't just store files — it decides where each one belongs.
          </p>
          <div className="mt-7">
            <LimeButton to="/auth">Open the console</LimeButton>
          </div>
        </div>

        <h1 className="display-xl mt-16 text-[17vw] leading-[0.82] sm:mt-24 sm:text-[15vw]">
          NexDrive
        </h1>
      </section>

      {/* STATEMENT */}
      <section className="mx-auto max-w-6xl px-2 py-16 sm:py-24">
        <h2 className="max-w-4xl text-3xl leading-tight sm:text-5xl">
          Pooling every drive you already pay for
          <span className="text-muted-foreground">
            {" "}
            — with quota-aware, rule-driven routing.
          </span>
        </h2>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <div className="blue-field rounded-2xl p-6">
            <p className="text-numeric text-[11px] uppercase tracking-[0.2em] opacity-70">
              Made for scale
            </p>
            <p className="mt-8 text-lg leading-snug">
              Route by quota, file type or folder. Not by guesswork.
            </p>
          </div>
          <div className="rounded-2xl bg-ink p-6 text-ink-foreground">
            <p className="text-numeric text-[11px] uppercase tracking-[0.2em] opacity-60">
              Est. adapters
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-ink-foreground/10 px-2.5 py-1 text-xs"
                >
                  <ProviderGlyph provider={p.id} size="sm" />
                  {p.name}
                </span>
              ))}
            </div>
          </div>
          <div className="panel flex flex-col justify-between p-6">
            <p className="text-numeric text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Pooled capacity
            </p>
            <p className="text-numeric text-5xl font-semibold text-primary">+32%</p>
            <p className="text-sm text-muted-foreground">
              Reclaimed by spreading uploads across idle backends.
            </p>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-6xl px-2">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-5xl font-bold text-primary sm:text-7xl">Our Engine</h2>
          <p className="text-numeric text-xs uppercase tracking-[0.2em] text-muted-foreground">
            [ Engine — 01 ]
          </p>
        </div>
        <div className="mt-10 divide-y divide-border border-y border-border">
          {FEATURES.map(({ icon: Icon, title, body }, i) => (
            <div key={title} className="grid gap-4 py-7 md:grid-cols-[4rem_1fr_1.2fr]">
              <span className="text-numeric text-sm text-muted-foreground">
                0{i + 1}
              </span>
              <h3 className="flex items-center gap-3 text-2xl font-medium">
                <Icon className="size-5 text-primary" />
                {title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ROUTING MODES */}
      <section className="mx-auto max-w-6xl px-2 py-20">
        <h2 className="text-5xl font-bold sm:text-7xl">
          <span className="text-primary">Routing</span> modes
        </h2>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ROUTING_MODES.map((m) => (
            <div key={m.id} className="panel p-6 transition-shadow hover:shadow-lift">
              <p className="text-numeric text-xs text-primary">{m.id}</p>
              <p className="mt-3 text-lg font-medium">{m.name}</p>
              <p className="mt-2 text-sm text-muted-foreground">{m.blurb}</p>
            </div>
          ))}
        </div>

        <div className="mt-14 grid grid-cols-2 gap-6 border-t border-border pt-10 md:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-numeric text-4xl font-semibold sm:text-5xl">{s.value}</p>
              <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="rounded-3xl bg-ink px-6 py-12 text-ink-foreground sm:px-10">
        <p className="text-numeric text-[11px] uppercase tracking-[0.2em] opacity-60">
          Ready to pool your drives?
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-6">
          <p className="text-3xl font-semibold tracking-tight sm:text-5xl">hello@nexdrive.app</p>
          <LimeButton to="/auth">Start routing</LimeButton>
        </div>
        <div className="mt-16 flex flex-wrap items-end justify-between gap-6 text-xs opacity-60">
          <p className="max-w-sm">
            © 2026 NexDrive. Unified gateway for Google Drive, Dropbox, OneDrive, R2, B2, Wasabi,
            MinIO and S3.
          </p>
          <p className="text-numeric uppercase tracking-[0.2em]">Built on Lovable Cloud</p>
        </div>
        <p className="display-xl mt-10 text-[15vw] leading-none opacity-90">NexDrive™</p>
      </footer>
    </div>
  );
}
