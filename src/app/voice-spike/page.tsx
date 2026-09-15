import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import { VoiceSpikeConsole } from "@/components/voice-spike-console";
import { isVoiceSpikeEnabled } from "@/lib/voice-spike";

export const dynamic = "force-dynamic";

export default async function VoiceSpikePage() {
  if (!isVoiceSpikeEnabled()) notFound();
  await auth.protect();

  return (
    <main className="flex flex-1 justify-center bg-zinc-50 px-6 py-10 font-sans dark:bg-black">
      <VoiceSpikeConsole />
    </main>
  );
}
