/**
 * In-memory event gate mirroring Speech Engine's event-id rule for deterministic
 * tests. The official SDK remains responsible for WebSocket protocol handling.
 */
export class VoiceSpikeTurnGate {
  private activeEventId = -1;
  private activeController: AbortController | null = null;

  begin(eventId: number): AbortSignal | null {
    if (!Number.isSafeInteger(eventId) || eventId <= this.activeEventId) {
      return null;
    }
    this.activeController?.abort();
    this.activeEventId = eventId;
    this.activeController = new AbortController();
    return this.activeController.signal;
  }

  isCurrent(eventId: number): boolean {
    return eventId === this.activeEventId && !this.activeController?.signal.aborted;
  }

  cancelCurrent(): void {
    this.activeController?.abort();
  }
}
