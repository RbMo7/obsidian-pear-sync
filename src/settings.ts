import { PluginSettingTab, Setting, App, Notice } from "obsidian";
import PearSyncPlugin from "./main";
import {
  generateMnemonic,
  normalizeMnemonic,
  validateMnemonic,
} from "./crypto/seed-phrase";

export class PearSyncSettingTab extends PluginSettingTab {
  plugin: PearSyncPlugin;

  constructor(app: App, plugin: PearSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Pear Sync — P2P Vault Sync" });

    // ── Vault identity ──────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Vault Identity" });

    const phrase = this.plugin.settings.seedPhrase || "";

    const desc = containerEl.createEl("p", {
      text:
        "This 12-word phrase is your vault's private identity. " +
        "Save it — you need it to pair with other devices. " +
        "Anyone with this phrase can read your vault.",
    });
    desc.style.cssText = "font-size:12px;opacity:.7";

    const phraseArea = containerEl.createEl("textarea", {
      cls: "pear-sync-phrase",
      text: phrase || "(no identity yet)",
    });
    phraseArea.style.cssText =
      "width:100%;height:60px;font-family:monospace;font-size:14px";
    phraseArea.readOnly = true;

    // Buttons row
    const btnRow = containerEl.createEl("div", {
      cls: "pear-sync-buttons",
    });
    btnRow.style.cssText = "display:flex;gap:8px;margin:8px 0";

    // Copy button
    const copyBtn = btnRow.createEl("button", { text: "Copy phrase" });
    copyBtn.onclick = () => {
      if (phrase) {
        navigator.clipboard.writeText(phrase);
        copyBtn.textContent = "Copied!";
        setTimeout(() => (copyBtn.textContent = "Copy phrase"), 2000);
      }
    };

    // Generate new identity
    const genBtn = btnRow.createEl("button", {
      text: "Generate new identity",
    });
    genBtn.onclick = async () => {
      const newPhrase = generateMnemonic();
      this.plugin.settings.seedPhrase = newPhrase;
      await this.plugin.saveSettings();
      this.plugin.onSeedChanged().catch(console.error);
      this.display();
      new Notice("New vault identity generated.");
    };

    // ── Pairing Invite ──────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Pairing Invite" });
    containerEl.createEl("p", {
      text: "Paste this into the mobile app to pair with this vault.",
    }).style.cssText = "font-size:12px;opacity:.7";

    const inviteStr =
      this.plugin.state.currentInvite || "(worker not ready)";
    const inviteArea = containerEl.createEl("textarea", {
      cls: "pear-sync-invite",
      text: inviteStr,
    });
    inviteArea.style.cssText =
      "width:100%;height:40px;font-family:monospace;font-size:12px;color:#22c55e";
    inviteArea.readOnly = true;

    const copyInviteBtn = containerEl.createEl("button", {
      text: "Copy invite",
    });
    copyInviteBtn.onclick = () => {
      if (inviteStr && inviteStr !== "(worker not ready)") {
        navigator.clipboard.writeText(inviteStr);
        copyInviteBtn.textContent = "Copied!";
        setTimeout(
          () => (copyInviteBtn.textContent = "Copy invite"),
          2000
        );
      }
    };

    // ── Import ──────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Import Identity" });
    containerEl.createEl("p", {
      text: "Paste a 12-word phrase from another device to copy its vault identity.",
      cls: "pear-sync-desc",
    }).style.cssText = "font-size:12px;opacity:.7";

    let importInput: HTMLInputElement;

    new Setting(containerEl)
      .setName("Import phrase")
      .addText((text) => {
        importInput = text.inputEl;
        text.inputEl.placeholder = "Paste 12-word phrase...";
      })
      .addButton((btn) =>
        btn.setButtonText("Import").onClick(async () => {
          const raw = importInput?.value || "";
          const phrase = normalizeMnemonic(raw);
          if (phrase.split(/\s+/).length !== 12) {
            new Notice("Enter exactly 12 words.");
            return;
          }
          if (!validateMnemonic(phrase)) {
            new Notice("Invalid phrase — check spelling.");
            return;
          }
          this.plugin.settings.seedPhrase = phrase;
          await this.plugin.saveSettings();
          this.plugin.onSeedChanged().catch(console.error);
          this.display();
          new Notice("Identity imported. Starting worker...");
        })
      );

    // ── Sync ────────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Sync" });

    new Setting(containerEl)
      .setName("Sync now")
      .setDesc("Force an immediate replication push to connected peers.")
      .addButton((btn) =>
        btn
          .setButtonText(
            this.plugin.state.isSyncing ? "Syncing..." : "Sync now"
          )
          .setDisabled(this.plugin.state.isSyncing)
          .onClick(() => {
            this.plugin.triggerSync().catch(console.error);
          })
      );

    // ── Status ──────────────────────────────────────────────────────
    containerEl.createEl("h3", { text: "Status" });

    new Setting(containerEl)
      .setName("Connected peers")
      .setDesc(String(this.plugin.state.connectedPeers));

    new Setting(containerEl)
      .setName("Last sync")
      .setDesc(
        this.plugin.settings.lastSyncTimestamp > 0
          ? new Date(this.plugin.settings.lastSyncTimestamp).toLocaleString()
          : "Never"
      );
  }
}
