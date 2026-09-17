import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { ProductShell } from "@/components/product-shell";
import { ToolConsole } from "@/components/tool-console";
import { AiOrchestratorConsole } from "@/components/ai-orchestrator-console";
import { ConversationCaseConsole } from "@/components/conversation-case-console";
export default async function DevelopmentPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  await auth.protect();
  return <ProductShell development><div className="space-y-6"><header><h1 className="text-2xl font-semibold">Utvecklingsverktyg</h1><p className="mt-2 text-muted-foreground">Endast lokal utveckling. Orkestratorns fake/live-läge väljs på servern. Använd endast testuppgifter.</p></header><ConversationCaseConsole /><ToolConsole /><AiOrchestratorConsole /></div></ProductShell>;
}
