import PearSyncPlugin from "../main";

const RIBBON_ICON = "sync-from-cloud";

export class SyncStatusUI {
  private plugin: PearSyncPlugin;
  private statusBarEl: HTMLElement | null = null;

  constructor(plugin: PearSyncPlugin) {
    this.plugin = plugin;
  }

  register(): void {
    this.plugin.addRibbonIcon(RIBBON_ICON, "Pear Sync — Sync now", () => {
      this.plugin.triggerSync().catch(console.error);
    });

    this.statusBarEl = this.plugin.addStatusBarItem();
    this.updateStatusBar();
  }

  updateStatusBar(): void {
    if (!this.statusBarEl) return;
    const s = this.plugin.state;
    const parts: string[] = [];

    if (s.isStarting) parts.push("Starting worker...");
    else if (s.isSyncing) parts.push("Syncing...");
    else if (s.driveReady) parts.push("P2P ready");
    else parts.push("Offline");

    parts.push(`${s.connectedPeers} peer${s.connectedPeers !== 1 ? "s" : ""}`);

    this.statusBarEl.setText(parts.join(" | "));
  }
}
