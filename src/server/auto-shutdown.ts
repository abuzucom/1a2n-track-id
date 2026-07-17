export interface AutoShutdownOptions {
  graceMs: number;
  enabled: boolean;
  onShutdown: () => void;
}

/**
 * Exits the server once the last overlay client disconnects, after a grace
 * period, so OBS refreshes/scene switches don't kill it. Never fires before
 * the first client has connected.
 */
export class AutoShutdown {
  private everConnected = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: AutoShutdownOptions) {}

  clientsChanged(count: number): void {
    if (!this.opts.enabled) return;
    if (count > 0) {
      this.everConnected = true;
      this.cancel();
    } else if (this.everConnected && !this.timer) {
      this.timer = setTimeout(() => this.opts.onShutdown(), this.opts.graceMs);
    }
  }

  dispose(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
