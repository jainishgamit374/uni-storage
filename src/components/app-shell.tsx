import { useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Files,
  Gauge,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  PlugZap,
  Route as RouteIcon,
} from "lucide-react";

import { useQueryClient } from "@tanstack/react-query";

import { DriveAssistant } from "@/components/drive-assistant";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { UploadDialog } from "@/components/upload-dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/files", label: "Files", icon: Files },
  { to: "/uploads", label: "Uploads", icon: History },
  { to: "/quota", label: "Quota", icon: Gauge },
  { to: "/settings/providers", label: "Providers", icon: PlugZap, group: "Settings" },
  { to: "/settings/policy", label: "Routing policy", icon: RouteIcon },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="space-y-1">
      {NAV.map((item) => {
        const { to, label, icon: Icon } = item;
        const group = "group" in item ? (item.group as string) : undefined;
        const active = pathname === to;
        return (
          <div key={to}>
            {group ? (
              <p className="mt-5 mb-1 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                {group}
              </p>
            ) : null}
            <Link
              to={to}
              onClick={onNavigate}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-200 hover:translate-x-0.5 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                active &&
                  "bg-sidebar-accent text-primary before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-full before:bg-lime",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          </div>
        );

      })}
    </nav>
  );
}

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-3 py-1">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-numeric text-sm font-bold text-primary-foreground">
        N
      </span>
      <span className="text-base font-semibold tracking-tight">NexDrive</span>
    </Link>
  );
}

export function AppShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar p-3 lg:flex">
        <Brand />
        <div className="mt-6 flex-1">
          <NavLinks />
        </div>
        <Button variant="ghost" className="justify-start text-muted-foreground" onClick={signOut}>
          <LogOut className="size-4" /> Sign out
        </Button>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex flex-wrap items-center gap-3 border-b border-border bg-background/80 px-4 py-4 backdrop-blur sm:px-6">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="lg:hidden">
                <Menu className="size-4" />
                <span className="sr-only">Open navigation</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-3">
              <Brand />
              <div className="mt-6">
                <NavLinks onNavigate={() => setMobileOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold">{title}</h1>
            {description && (
              <p className="truncate text-sm text-muted-foreground">{description}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {actions}
            <ThemeToggle />
            <UploadDialog />
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>

      <DriveAssistant />
    </div>
  );
}
