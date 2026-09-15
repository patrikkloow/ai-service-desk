export function isVoiceSpikeEnabled(
  environment: Record<string, string | undefined> = process.env,
): boolean {
  return (
    environment.NODE_ENV === "development" &&
    environment.VOICE_SPIKE_ENABLED === "true"
  );
}

export function requireVoiceSpikeEnabled(
  environment: Record<string, string | undefined> = process.env,
): void {
  if (!isVoiceSpikeEnabled(environment)) {
    throw new Error("The voice feasibility spike is disabled.");
  }
}
