# Backend

All server-side code lives here; everything under `src/routes`, `src/components`
and `src/lib` is frontend.

- `api/` — `*.functions.ts`, the typed RPC surface the UI calls
  (`createServerFn`). These are the only backend modules a component may import.
- `services/` — `*.server.ts` adapters and integrations (Google Drive, storage
  providers, token crypto). Never imported by client code directly; server
  functions load them (statically or via `await import(...)`).
- `shared/` — pure logic shared by the backend (routing rules, validation),
  no I/O, unit-tested.
- `__tests__/` — backend unit + adversarial tests (`bunx vitest run`).

HTTP endpoints for external callers (webhooks, OAuth callbacks, download proxy)
stay under `src/routes/api/` because TanStack Start derives their URL from the
file path; they should stay thin and delegate to `services/`.
