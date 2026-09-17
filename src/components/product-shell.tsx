"use client";

import { Component, type ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { OrganizationSwitcher, SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";
import { useTenantProvisioning } from "./tenant-bootstrap";

const navigation = [["/", "Översikt"], ["/inbox", "Inkorg"], ["/requests", "Förfrågningar"], ["/calendar", "Kalender"], ["/customers", "Kunder"], ["/settings", "Inställningar"]] as const;
class WorkspaceError extends Component<{children: ReactNode}, {failed: boolean}> {
  state = {failed: false};
  static getDerivedStateFromError() { return {failed: true}; }
  render() { return this.state.failed ? <div role="alert" className="space-y-4"><h1>Vyn kunde inte laddas</h1><p>Ladda om sidan och försök igen.</p><Button onClick={() => window.location.reload()}>Ladda om</Button></div> : this.props.children; }
}
export function ProductShell({ children, development = false }: { children: ReactNode; development?: boolean }) {
  const path = usePathname();
  const { orgId, userId } = useAuth();
  const { isReady, error } = useTenantProvisioning();
  const [menuOpen, setMenuOpen] = useState(false);
  const links = <nav aria-label="Huvudnavigation" className="grid gap-1">{navigation.map(([href, label]) => <Link key={href} href={href} onClick={() => setMenuOpen(false)} aria-current={(href === "/" ? path === href : path.startsWith(href)) ? "page" : undefined} className="rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted aria-[current=page]:bg-secondary aria-[current=page]:text-foreground">{label}</Link>)}</nav>;
  return <>
    <Authenticated>
      <a href="#workspace" className="sr-only focus:not-sr-only focus:p-4">Till innehållet</a>
      <div className="min-h-svh lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden border-r bg-card p-5 lg:block"><Link href="/" className="mb-10 block px-4 py-3 text-sm font-semibold tracking-tight">AI Service Desk</Link>{links}<p className="mt-10 px-4 text-xs leading-relaxed text-muted-foreground">Mer tid för kunderna.<br />Mindre att hålla reda på.</p></aside>
        <div className="min-w-0">
          <header className="flex min-h-20 min-w-0 flex-wrap items-center justify-between gap-3 border-b bg-card px-4 sm:px-8">
            <div className="flex items-center gap-3"><Sheet open={menuOpen} onOpenChange={setMenuOpen}><SheetTrigger asChild><Button variant="outline" size="icon" aria-label="Öppna meny" className="lg:hidden"><Menu /></Button></SheetTrigger><SheetContent side="left"><SheetHeader><SheetTitle>AI Service Desk</SheetTitle><SheetDescription>Välj en del av arbetsytan.</SheetDescription></SheetHeader><div className="px-4">{links}</div></SheetContent></Sheet><span className="text-sm font-medium">{development ? "Utvecklingsverktyg" : "Din arbetsyta"}</span></div>
            <div className="flex min-w-0 max-w-full items-center gap-3"><div className="max-w-[190px]"><OrganizationSwitcher /></div><UserButton /></div>
          </header>
          <main id="workspace" className="mx-auto max-w-[1440px] p-4 py-6 sm:p-8 lg:p-10">
            {!orgId ? <div className="rounded-xl border bg-card p-6"><h1 className="text-xl font-semibold">Välj ditt företag</h1><p className="mt-2 text-muted-foreground">Välj eller skapa en organisation i menyn ovan för att öppna arbetsytan.</p></div> : !isReady ? <p role={error ? "alert" : "status"}>{error ? "Arbetsytan kunde inte förberedas. Ladda om och försök igen." : "Förbereder arbetsytan…"}</p> : <WorkspaceError key={`${orgId}:${userId}:${path}`}><div key={`${orgId}:${userId}`} className="min-w-0">{children}</div></WorkspaceError>}
          </main>
        </div>
      </div>
    </Authenticated>
    <Unauthenticated><main className="mx-auto flex min-h-svh max-w-md flex-col justify-center gap-5 p-6"><p className="text-sm font-semibold text-muted-foreground">AI Service Desk</p><h1 className="text-3xl font-semibold tracking-tight">En enklare arbetsdag.</h1><p className="text-muted-foreground">Se vad som behöver din hjälp och ta nästa steg med kunden.</p><SignInButton><Button>Logga in</Button></SignInButton></main></Unauthenticated>
    <AuthLoading><p role="status" className="p-8">Laddar arbetsytan…</p></AuthLoading>
  </>;
}
