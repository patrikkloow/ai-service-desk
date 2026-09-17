"use client";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
export function Overview() {
  const queue = useQuery(api.inbox.list, {view: "attention"});
  const recent = useQuery(api.inbox.list, {view: "all"});
  const count = queue?.items.filter(item => item.attention === "requested").length;
  return <div className="space-y-8"><header><p className="mb-2 text-sm text-muted-foreground">Översikt</p><h1 className="text-3xl font-semibold tracking-tight">Vad behöver din uppmärksamhet idag?</h1><p className="mt-3 text-muted-foreground">Här börjar din arbetsdag. Inkorgen samlar det som behöver en människa.</p></header>
    <Card className="max-w-2xl"><CardHeader><CardTitle>Behöver din hjälp</CardTitle></CardHeader><CardContent className="space-y-5">{queue ? <><p className="text-4xl font-semibold">{queue.limited ? "Minst " : ""}{count}</p><p className="text-sm text-muted-foreground">Förfrågningar och uppföljningar som ännu inte tagits om hand. {queue.items.filter(i => i.attention === "acknowledged").length} i kön är omhändertagna.</p>{queue.limited && <p className="text-sm text-muted-foreground">Antalen gäller ett begränsat urval.</p>}</> : <Skeleton className="h-12 w-24" />}<Button asChild><Link href="/inbox">Öppna inkorgen</Link></Button></CardContent></Card>
    <section className="max-w-2xl"><h2 className="mb-4 text-lg font-semibold">Senast uppdaterade förfrågningar</h2>{!recent ? <Skeleton className="h-24 w-full" /> : <><ul className="divide-y rounded-xl border bg-card px-5">{recent.items.filter(i => i.kind === "request").sort((a,b) => b.updatedAt-a.updatedAt).slice(0,5).map(item => <li key={item.id}><Link href={`/requests?selected=${item.id}`} className="block py-4 hover:underline"><p className="font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.customerId ? item.customer : "Ingen kund kopplad"}</p></Link></li>)}</ul>{!recent.items.some(i => i.kind === "request") && <p className="py-4 text-muted-foreground">Inga förfrågningar ännu. Skapa den första i inkorgen.</p>}{recent.limited && <p className="mt-3 text-sm text-muted-foreground">Visar ett begränsat urval.</p>}</>}</section>
  </div>;
}
