# NexDrive Hub

Good context. Jainish is already deep in Next.js + React ecosystem with his HRMS. Now let me design a refined version of 9Drive — a universal storage gateway with Next.js + shadcn/ui.Now let me plan and build this comprehensive architecture document + starter scaffold.Now I have everything I need. Let me design this properly — a refined NexDriveconcept (universal storage gateway) built on Next.js + shadcn/ui with an interactive mockup.Here's the full refined concept — navigate the sidebar tabs and try the modals. Now let me break down the full architecture for building this with Next.js + shadcn/ui:

What's refined vs 9Drive

The core idea is the same — a unified storage gateway — but these are the major upgrades:

New providers: Beyond Google Drive + S3, the new architecture natively supports Dropbox (OAuth), OneDrive (MS Graph API), Backblaze B2, Wasabi, and any custom S3-compatible endpoint. Each provider has its own adapter class behind a unified StorageProvider interface.

Smart routing: The old 9Drive had 3 routing modes. The new one adds file-type rules ("route .mp4 to R2, route .docx to Google Drive") and folder-based routing ("anything under /clients/ goes to Dropbox"), configurable via a UI policy builder.

Next.js App Router: Moving from Vite React to Next.js gives you server components, API routes co-located with the frontend, middleware-based auth, and better performance.

Tech stack

Frontend:   Next.js 14 (App Router) + TypeScript
UI:         shadcn/ui + Tailwind CSS
Backend:    Next.js API Routes + Route Handlers
ORM:        Prisma (keep MySQL or switch to PostgreSQL)
Auth:       NextAuth.js v5 — handles Google, email/password in one
Queue:      BullMQ (Redis) for async upload jobs
Storage:    Provider adapters behind a unified interface


Project structure

nexdrive/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx          ← sidebar + topbar shell
│   │   ├── page.tsx            ← dashboard overview
│   │   ├── files/page.tsx      ← unified file manager
│   │   ├── uploads/page.tsx    ← upload history
│   │   ├── quota/page.tsx      ← per-provider quota bars
│   │   └── settings/
│   │       ├── providers/page.tsx   ← connect/manage providers
│   │       └── policy/page.tsx      ← routing rules builder
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── providers/
│       │   ├── google/connect/route.ts
│       │   ├── google/callback/route.ts
│       │   ├── dropbox/connect/route.ts
│       │   └── s3/connect/route.ts
│       ├── files/
│       │   ├── route.ts        ← GET list, DELETE batch
│       │   └── [id]/route.ts   ← GET, PATCH, DELETE
│       └── uploads/
│           └── route.ts        ← POST multipart/form-data
│
├── lib/
│   ├── providers/
│   │   ├── interface.ts        ← StorageProvider abstract class
│   │   ├── google-drive.ts
│   │   ├── dropbox.ts
│   │   ├── s3-compatible.ts    ← works for R2, B2, MinIO, AWS
│   │   └── registry.ts         ← maps account → provider instance
│   ├── routing/
│   │   └── router.ts           ← upload routing engine
│   ├── encryption.ts
│   └── auth.ts                 ← NextAuth config
│
├── components/
│   ├── ui/                     ← shadcn components (Button, Dialog, etc.)
│   ├── providers/
│   │   ├── ConnectCard.tsx
│   │   └── QuotaBar.tsx
│   ├── files/
│   │   ├── FileTable.tsx
│   │   └── FileActions.tsx
│   └── upload/
│       ├── UploadModal.tsx
│       └── ProgressPanel.tsx
│
└── prisma/
    └── schema.prisma


The provider interface (key design pattern)

// lib/providers/interface.ts
export interface StorageFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  modifiedAt: Date;
  path: string;
}

export interface StorageQuota {
  used: number;   // bytes
  total: number;  // bytes
}

export abstract class StorageProvider {
  abstract getQuota(): Promise<StorageQuota>;
  abstract listFiles(folderId?: string): Promise<StorageFile[]>;
  abstract uploadStream(
    stream: ReadableStream,
    fileName: string,
    mimeType: string,
    folderId?: string
  ): Promise<StorageFile>;
  abstract deleteFile(fileId: string): Promise<void>;
  abstract getDownloadUrl(fileId: string): Promise<string>;
  abstract renameFile(fileId: string, newName: string): Promise<void>;
}


Every provider implements this interface. The upload route calls registry.getProvider(accountId).uploadStream(...) — it doesn't care if it's Google Drive or R2 underneath.

Routing engine (smart upload dispatch)

// lib/routing/router.ts
export type RoutingMode =
  | 'most-available'
  | 'round-robin'
  | 'priority-order'
  | 'file-type-rules'
  | 'folder-rules';

export async function resolveProvider(
  accounts: ConnectedAccount[],
  policy: RoutingPolicy,
  file: { mimeType: string; folderId?: string }
): Promise<ConnectedAccount> {
  if (policy.mode === 'most-available') {
    const withQuota = await Promise.all(
      accounts.map(async (a) => ({
        account: a,
        free: (await getProvider(a).getQuota()).then(q => q.total - q.used),
      }))
    );
    return withQuota.sort((a, b) => b.free - a.free)[0].account;
  }
  // ... other modes
}


shadcn/ui components to use

The UI maps directly to shadcn primitives — no custom CSS needed for most of it:

Sheet → mobile sidebar

Dialog → upload modal, connect modal

Command → global file search (⌘K)

DataTable (TanStack Table + shadcn) → file manager with sorting/filtering

Progress → quota bars, upload progress

DropdownMenu → right-click file actions

Select → provider filter, routing policy

Tabs → file type filter tabs

Sonner (toast) → upload complete, error notifications

Badge → provider labels on file rows

Key improvements over 9Drive

Feature9DriveNexDriveProvidersGoogle Drive + S3Google Drive, Dropbox, OneDrive, R2, B2, Wasabi, MinIO, S3AuthExpress sessionsNextAuth.js (Google, email, magic link)File routing3 modes5 modes including file-type + folder rulesUIVite React (custom CSS)Next.js + shadcn/ui (Tailwind)UploadStreamingStreaming + chunked multipart for large filesSearchNoneCross-provider unified searchMobileNoneResponsive sidebar + mobile-first layoutRealtimePollingServer-Sent Events for upload progress

Want me to scaffold the actual Next.js + shadcn project — starting with the provider interface, Prisma schema, or the file manager component?

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/4393b0ca-7581-461e-81b4-b556b34cfc04).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
