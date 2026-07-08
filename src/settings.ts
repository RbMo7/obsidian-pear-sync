import { PluginSettingTab, Setting, App, Notice } from "obsidian";
import PearSyncPlugin from "./main";
import { generateMnemonic } from "./crypto/seed-phrase";

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

    // ── Join another vault ──────────────────────────────────────────
    containerEl.createEl("h3", { text: "Join Another Device's Vault" });
    containerEl.createEl("p", {
      text: "Paste the pear-sync:... invite from the other device to replicate its vault here.",
    }).style.cssText = "font-size:12px;opacity:.7";

    const modeLabel = containerEl.createEl("p", {
      text: this.plugin.settings.remoteKey
        ? `Currently joining remote vault (key: ${this.plugin.settings.remoteKey.slice(0, 16)}...)`
        : "Currently running as vault owner.",
    });
    modeLabel.style.cssText = "font-size:12px;font-weight:bold;margin:4px 0";

    let joinInput: HTMLInputElement;

    new Setting(containerEl)
      .setName("Paste invite")
      .addText((text) => {
        joinInput = text.inputEl;
        joinInput.placeholder = "pear-sync:...";
        joinInput.style.width = "100%";
      })
      .addButton((btn) =>
        btn.setButtonText("Join").onClick(async () => {
          const raw = joinInput?.value?.trim() || "";
          if (!raw.startsWith("pear-sync:")) {
            new Notice("Invalid invite — must start with pear-sync:");
            return;
          }
          const hex = raw.slice("pear-sync:".length);
          if (!/^[0-9a-f]{64}$/i.test(hex)) {
            new Notice("Invalid invite — bad key format.");
            return;
          }
          this.plugin.settings.remoteKey = hex.toLowerCase();
          await this.plugin.saveSettings();
          this.plugin.onSeedChanged().catch(console.error);
          this.display();
          new Notice("Joining remote vault. Connecting to peers...");
        })
      );

    if (this.plugin.settings.remoteKey) {
      new Setting(containerEl)
        .setName("Leave remote vault")
        .setDesc("Switch back to owning your own vault.")
        .addButton((btn) =>
          btn.setButtonText("Leave").onClick(async () => {
            this.plugin.settings.remoteKey = "";
            await this.plugin.saveSettings();
            this.plugin.onSeedChanged().catch(console.error);
            this.display();
            new Notice("Left remote vault. Running as vault owner.");
          })
        );
    }

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
