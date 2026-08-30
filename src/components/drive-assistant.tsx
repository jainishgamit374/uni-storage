import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Search, Send, Sparkles, X } from "lucide-react";

import { ProviderGlyph } from "@/components/provider-glyph";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { fileKind, formatBytes, formatRelative } from "@/lib/format";
import { providerMeta } from "@/lib/providers";
import { useOverview } from "@/lib/use-overview";
import { cn } from "@/lib/utils";

type Hit = {
  id: string;
  name: string;
  size: number;
  folder: string;
  provider: string;
  account: string;
  when: string;
};

type Message = {
  id: string;
  role: "bot" | "user";
  text: string;
  hits?: Hit[];
};

const KINDS = ["image", "video", "audio", "document", "archive"] as const;

const SUGGESTIONS = [
  "big videos",
  "PDFs on Dropbox",
  "newest uploads",
  "what's using my space?",
];

/** Cute animated mascot face — blinks and bobs. */
function Mascot({ thinking, className }: { thinking?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "blue-field relative flex size-9 shrink-0 items-center justify-center rounded-xl",
        className,
      )}
      style={{ animation: thinking ? undefined : "var(--animate-bob)" }}
      aria-hidden="true"
    >
      <span className="flex items-center gap-1">
        <span
          className={cn("size-1.5 rounded-full bg-lime", thinking && "animate-ping")}
        />
        <span
          className={cn("size-1.5 rounded-full bg-lime", thinking && "animate-ping")}
          style={{ animationDelay: "150ms" }}
        />
      </span>
      <span className="absolute -bottom-0.5 h-1 w-3 rounded-full bg-lime/70" />
    </span>
  );
}

export function DriveAssistant() {
  const { data } = useOverview();
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "hello",
      role: "bot",
      text: "Hi! I'm Nex. Ask me for anything in your drives — try \"big videos\" or \"PDFs on Dropbox\".",
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);

  const index = useMemo(() => {
    if (!data) return [] as (Hit & { kind: string; providerName: string; createdAt: string })[];
    return data.files.map((f) => {
      const account = data.accounts.find((a) => a.id === f.account_id);
      const provider = account?.provider ?? "s3";
      return {
        id: f.id,
        name: f.name,
        size: Number(f.size),
        folder: f.folder_path,
        provider,
        providerName: providerMeta(provider).name,
        account: account?.label ?? "Unassigned",
        kind: fileKind(f.mime_type, f.name),
        createdAt: f.created_at,
        when: formatRelative(f.created_at),
      };
    });
  }, [data]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  function answer(raw: string): Message {
    const q = raw.toLowerCase().trim();
    const id = `${Date.now()}-bot`;

    if (!data) {
      return { id, role: "bot", text: "Still loading your gateway — ask me again in a second." };
    }

    // Capacity question
    if (/space|quota|capacity|storage left|full/.test(q)) {
      const total = data.accounts.reduce((s, a) => s + Number(a.quota_total), 0);
      const used = data.accounts.reduce((s, a) => s + Number(a.quota_used), 0);
      const roomiest = [...data.accounts].sort(
        (a, b) =>
          Number(b.quota_total) - Number(b.quota_used) - (Number(a.quota_total) - Number(a.quota_used)),
      )[0];
      return {
        id,
        role: "bot",
        text: `You're using ${formatBytes(used)} of ${formatBytes(total)} pooled. Most headroom right now: ${
          roomiest?.label ?? "no connected drive"
        }.`,
      };
    }

    let hits = index;

    const kind = KINDS.find((k) => q.includes(k) || q.includes(`${k}s`));
    if (kind) hits = hits.filter((f) => f.kind === kind);
    if (/pdf/.test(q)) hits = hits.filter((f) => f.name.toLowerCase().endsWith(".pdf"));

    const provider = data.accounts.find(
      (a) => q.includes(a.label.toLowerCase()) || q.includes(providerMeta(a.provider).name.toLowerCase()),
    );
    if (provider) hits = hits.filter((f) => f.account === provider.label);

    const folderMatch = q.match(/(?:in|under)\s+\/?([\w-]+)/);
    if (folderMatch) {
      const seg = folderMatch[1];
      hits = hits.filter((f) => f.folder.toLowerCase().includes(seg));
    }

    const terms = q
      .replace(/[^a-z0-9.\s-]/g, " ")
      .split(/\s+/)
      .filter(
        (t) =>
          t.length > 2 &&
          !["the", "my", "all", "show", "find", "files", "file", "from", "with", "big", "new", "newest", "largest", "recent", "and", "for", "any"].includes(t),
      );
    if (terms.length && !kind && !provider) {
      const narrowed = hits.filter((f) =>
        terms.some((t) => `${f.name} ${f.folder} ${f.account}`.toLowerCase().includes(t)),
      );
      if (narrowed.length) hits = narrowed;
    }

    if (/big|large|largest|heavy/.test(q)) hits = [...hits].sort((a, b) => b.size - a.size);
    else if (/new|recent|latest/.test(q))
      hits = [...hits].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const top = hits.slice(0, 5);

    if (top.length === 0) {
      return {
        id,
        role: "bot",
        text: index.length
          ? "Nothing matched that. Try a provider name, a file type like \"images\", or part of a filename."
          : "Your gateway is empty so far — upload a file and I'll be able to find it instantly.",
      };
    }

    return {
      id,
      role: "bot",
      text: `Found ${hits.length} match${hits.length === 1 ? "" : "es"}${
        top.length < hits.length ? ` — top ${top.length}` : ""
      }:`,
      hits: top,
    };
  }

  function send(text: string) {
    const value = text.trim();
    if (!value) return;
    setMessages((m) => [...m, { id: `${Date.now()}-u`, role: "user", text: value }]);
    setInput("");
    setThinking(true);
    window.setTimeout(() => {
      setMessages((m) => [...m, answer(value)]);
      setThinking(false);
    }, 420);
  }

  return (
    <>
      <Button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close drive assistant" : "Open drive assistant"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-40 size-14 rounded-full bg-ink p-0 text-ink-foreground shadow-lift transition-transform duration-300 hover:scale-105 hover:bg-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
        {!open && (
          <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-lime ring-2 ring-background" />
        )}
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Drive assistant"
          className="panel fixed bottom-24 right-5 z-40 flex h-[26rem] w-[min(22rem,calc(100vw-2.5rem))] flex-col overflow-hidden"
          style={{ animation: "var(--animate-pop)" }}
        >
          <div className="flex items-center gap-3 border-b border-border p-3">
            <Mascot thinking={thinking} />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight">Nex</p>
              <p className="text-xs text-muted-foreground">Searches every connected drive</p>
            </div>
            <Sparkles className="ml-auto size-4 text-primary" aria-hidden="true" />
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-3 p-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn("stagger-in flex", m.role === "user" && "justify-end")}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-xl px-3 py-2 text-sm",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground",
                    )}
                  >
                    <p>{m.text}</p>
                    {m.hits && (
                      <ul className="mt-2 space-y-1.5">
                        {m.hits.map((h) => (
                          <li
                            key={h.id}
                            className="row-interactive flex items-center gap-2 rounded-lg bg-surface p-2"
                          >
                            <ProviderGlyph provider={h.provider} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-medium">{h.name}</span>
                              <span className="text-numeric block truncate text-[11px] text-muted-foreground">
                                {h.account} · {formatBytes(h.size)} · {h.when}
                              </span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Mascot thinking className="size-6" />
                  searching your drives…
                </div>
              )}
              <div ref={endRef} />
            </div>
          </ScrollArea>

          <div className="border-t border-border p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="pill bg-surface-raised transition-colors hover:border-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {s}
                </button>
              ))}
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <div className="relative flex-1">
                <Search
                  className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your files…"
                  aria-label="Ask the drive assistant"
                  className="h-10 pl-8"
                />
              </div>
              <Button type="submit" size="icon" aria-label="Send" className="min-h-11 min-w-11">
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
