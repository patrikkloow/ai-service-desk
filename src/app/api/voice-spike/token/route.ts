import { auth } from "@clerk/nextjs/server";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { NextResponse } from "next/server";
import { isVoiceSpikeEnabled } from "@/lib/voice-spike";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isVoiceSpikeEnabled()) return new NextResponse(null, { status: 404 });

  await auth.protect();
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const speechEngineId = process.env.ELEVENLABS_SPEECH_ENGINE_ID;
  if (!apiKey || !speechEngineId) {
    return NextResponse.json(
      { error: "Live voice spike is not configured." },
      { status: 503 },
    );
  }

  try {
    const client = new ElevenLabsClient({ apiKey });
    const result = await client.conversationalAi.conversations.getWebrtcToken({
      agentId: speechEngineId,
    });
    return NextResponse.json({ token: result.token });
  } catch {
    return NextResponse.json(
      { error: "Live voice session could not be prepared." },
      { status: 502 },
    );
  }
}
