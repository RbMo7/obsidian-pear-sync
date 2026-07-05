import { Vault, TFile, TAbstractFile } from "obsidian";
import { SyncQueue } from "./sync-queue";

export type VaultEventType = "create" | "modify" | "delete" | "rename";

export interface VaultEvent {
  type: VaultEventType;
  path: string;
  oldPath?: string;
}

export class VaultWatcher {
  private vault: Vault;
  private queue: SyncQueue;
  private registered = false;

  constructor(vault: Vault, queue: SyncQueue) {
    this.vault = vault;
    this.queue = queue;
  }

  register(): void {
    if (this.registered) return;

    this.vault.on("create", (file: TAbstractFile) =>
      this.onFileEvent("create", file)
    );
    this.vault.on("modify", (file: TAbstractFile) =>
      this.onFileEvent("modify", file)
    );
    this.vault.on("delete", (file: TAbstractFile) =>
      this.onFileEvent("delete", file)
    );
    this.vault.on("rename", (file: TAbstractFile, oldPath: string) =>
      this.onRename(file, oldPath)
    );

    this.registered = true;
  }

  unregister(): void {
    this.registered = false;
  }

  private onFileEvent(type: VaultEventType, file: TAbstractFile): void {
    if (!(file instanceof TFile)) return;
    if (shouldIgnore(file.path)) return;
    this.queue.push({ type, path: file.path });
  }

  private onRename(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile)) return;
    if (shouldIgnore(file.path) && shouldIgnore(oldPath)) return;
    this.queue.push({ type: "rename", path: file.path, oldPath });
  }
}

function shouldIgnore(filePath: string): boolean {
  return (
    filePath.startsWith(".obsidian/") ||
    filePath.startsWith("node_modules/") ||
    filePath.startsWith("data/")
  );
}
