import { VaultEvent } from "./watcher";

export type FlushHandler = (events: VaultEvent[]) => Promise<void>;

const DEBOUNCE_WINDOW_MS = 1500;

export class SyncQueue {
  private pending: VaultEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushHandler: FlushHandler;
  private _locked = false;

  constructor(flushHandler: FlushHandler) {
    this.flushHandler = flushHandler;
  }

  get locked(): boolean {
    return this._locked;
  }

  get size(): number {
    return this.pending.length;
  }

  push(event: VaultEvent): void {
    if (event.type === "modify" || event.type === "create") {
      this.pending = this.pending.filter(
        (e) =>
          !(e.path === event.path && (e.type === "modify" || e.type === "create"))
      );
    }
    if (event.type === "delete") {
      this.pending = this.pending.filter((e) => e.path !== event.path);
      this.pending = this.pending.filter(
        (e) => !(e.type === "rename" && e.oldPath === event.path)
      );
    }

    this.pending.push(event);
    this.scheduleFlush();
  }

  async flushNow(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.flush();
  }

  drain(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = [];
  }

  private scheduleFlush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.flush().catch(console.error);
    }, DEBOUNCE_WINDOW_MS);
  }

  private async flush(): Promise<void> {
    if (this._locked || this.pending.length === 0) return;

    this._locked = true;
    const batch = this.pending.splice(0);
    try {
      await this.flushHandler(batch);
    } finally {
      this._locked = false;
    }
  }
}
