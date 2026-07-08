import { Plugin, Notice, TFile } from "obsidian";
import { PearSyncSettingTab } from "./settings";
import {
  PearSyncSettings,
  DEFAULT_SETTINGS,
  PearSyncPluginState,
  INITIAL_STATE,
} from "./settings-defaults";
import { WorkerBridge } from "./ipc/bridge";
import { WorkerEvent } from "./ipc/types";
import { VaultWatcher, VaultEvent } from "./vault/watcher";
import { SyncQueue } from "./vault/sync-queue";
import { SyncStatusUI } from "./ui/sync-status-icon";
import { InviteModal } from "./ui/invite-modal";
import * as path from "path";

// ... (keep existing imports)

export default class PearSyncPlugin extends Plugin {
  settings: PearSyncSettings = { ...DEFAULT_SETTINGS };
  state: PearSyncPluginState = { ...INITIAL_STATE };

  private bridge!: WorkerBridge;
  private watcher!: VaultWatcher;
  private queue!: SyncQueue;
  private ui!: SyncStatusUI;
  private pluginDir = "";

  async onload(): Promise<void> {
    console.log("[Pear Sync] Loading plugin...");

    await this.loadSettings();
    this.state = { ...INITIAL_STATE };

    const vaultPath = (
      this.app.vault.adapter as { getBasePath?: () => string }
    ).getBasePath?.() ?? "";
    this.pluginDir = path.join(
      vaultPath,
      ".obsidian",
      "plugins",
      "obsidian-pear-sync"
    );

    this.bridge = new WorkerBridge((event) => this.handleWorkerEvent(event));
    this.queue = new SyncQueue((events) => this.handleFlush(events));
    this.watcher = new VaultWatcher(this.app.vault, this.queue);
    this.ui = new SyncStatusUI(this);

    this.addCommand({
      id: "pear-sync-sync-now",
      name: "Sync now",
      callback: () => this.triggerSync(),
    });
    this.addCommand({
      id: "pear-sync-show-invite",
      name: "Show pairing invite",
      callback: () => this.showInvite(),
    });

    this.addSettingTab(new PearSyncSettingTab(this.app, this));
    this.ui.register();
    this.ui.updateStatusBar();
    this.watcher.register();

    if (this.settings.seedPhrase) {
      await this.startWorker();
    } else {
      console.log("[Pear Sync] No seed phrase set. Go to settings to generate or import one.");
    }

    console.log("[Pear Sync] Plugin loaded.");
  }

  async onunload(): Promise<void> {
    console.log("[Pear Sync] Unloading plugin...");
    this.watcher.unregister();
    this.queue.drain();
    if (this.bridge.running) {
      await this.bridge.stop();
    }
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async startWorker(): Promise<void> {
    try {
      if (this.bridge.running) await this.bridge.stop();

      this.state.driveReady = false;
      this.state.isStarting = true;
      this.ui.updateStatusBar();

      await this.bridge.start(this.pluginDir, this.settings.seedPhrase);

      this.state.isStarting = false;
      this.ui.updateStatusBar();

      // After worker initialises, sync all vault files into the drive
      await this.fullVaultSync();
    } catch (err) {
      console.error("[Pear Sync] Worker start failed:", err);
      this.state.isStarting = false;
      this.state.driveReady = false;
      this.ui.updateStatusBar();
      new Notice("Pear Sync: failed to start P2P worker.");
    }
  }

  private handleWorkerEvent(event: WorkerEvent): void {
    switch (event.type) {
      case "init-complete":
        this.state.driveReady = true;
        this.ui.updateStatusBar();
        new Notice("Pear Sync ready — P2P drive initialised.");
        // Pre-fetch the invite string so settings can display it
        this.bridge.getInvite().catch(console.error);
        break;
      case "peer-count":
        this.state.connectedPeers = event.count;
        this.ui.updateStatusBar();
        break;
      case "invite":
        this.state.currentInvite = event.invite;
        break;
      case "error":
        console.error("[Pear Sync] Worker error:", event.message);
        new Notice(`Pear Sync error: ${event.message}`);
        break;
      case "shutdown-complete":
        this.state.driveReady = false;
        this.state.connectedPeers = 0;
        this.ui.updateStatusBar();
        break;
    }
  }

  private async fullVaultSync(): Promise<void> {
    const files = this.app.vault.getFiles();
    let count = 0;

    for (const file of files) {
      if (shouldIgnore(file.path)) continue;
      try {
        const content = await this.app.vault.readBinary(file);
        await this.bridge.upsertFile(file.path, content);
        count++;
      } catch (err) {
        console.error(`[Pear Sync] Failed to sync ${file.path}:`, err);
      }
    }

    this.settings.lastSyncTimestamp = Date.now();
    await this.saveSettings();
    console.log(`[Pear Sync] Initial sync complete: ${count} files`);
  }

  async onSeedChanged(): Promise<void> {
    if (this.bridge.running) await this.bridge.stop();
    this.state.driveReady = false;
    this.state.connectedPeers = 0;
    this.ui.updateStatusBar();

    if (!this.settings.seedPhrase) return;
    await this.startWorker();
    this.ui.updateStatusBar();
  }

  async triggerSync(): Promise<void> {
    if (this.state.isSyncing || !this.state.driveReady) return;
    this.state.isSyncing = true;
    this.ui.updateStatusBar();

    try {
      await this.queue.flushNow();
      this.settings.lastSyncTimestamp = Date.now();
      await this.saveSettings();
      new Notice("Pear Sync: synced.");
    } catch (err) {
      console.error("[Pear Sync] Sync failed:", err);
    } finally {
      this.state.isSyncing = false;
      this.ui.updateStatusBar();
    }
  }

  async showInvite(): Promise<void> {
    if (!this.state.driveReady) {
      new Notice("Set a seed phrase in settings first.");
      return;
    }
    await this.bridge.getInvite();
    setTimeout(() => {
      if (this.state.currentInvite) {
        new InviteModal(this.app, this.state.currentInvite).open();
      }
    }, 100);
  }

  async getInviteString(): Promise<string | null> {
    if (!this.state.driveReady) return null;
    await this.bridge.getInvite();
    return new Promise((resolve) => {
      setTimeout(() => resolve(this.state.currentInvite), 200);
    });
  }

  private async handleFlush(events: VaultEvent[]): Promise<void> {
    if (!this.state.driveReady) return;

    for (const event of events) {
      try {
        switch (event.type) {
          case "create":
          case "modify": {
            const file = this.app.vault.getAbstractFileByPath(event.path);
            if (file instanceof TFile) {
              const content = await this.app.vault.readBinary(file);
              await this.bridge.upsertFile(event.path, content);
            }
            break;
          }
          case "delete":
            await this.bridge.deleteFile(event.path);
            break;
          case "rename":
            if (event.oldPath) {
              await this.bridge.deleteFile(event.oldPath);
            }
            break;
        }
      } catch (err) {
        console.error(`[Pear Sync] Failed ${event.type} ${event.path}:`, err);
      }
    }
  }
}

function shouldIgnore(filePath: string): boolean {
  return (
    filePath.startsWith(".obsidian/") ||
    filePath.startsWith("node_modules/") ||
    filePath.startsWith("data/")
  );
}
