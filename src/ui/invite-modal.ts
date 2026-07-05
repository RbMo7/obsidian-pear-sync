import { Modal, App, Setting } from "obsidian";

export class InviteModal extends Modal {
  private invite: string;

  constructor(app: App, invite: string) {
    super(app);
    this.invite = invite;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Pairing Invite" });

    contentEl.createEl("p", {
      text: "Share this invite with pear-vault-mobile to pair with this vault.",
    });

    contentEl.createEl("pre", {
      cls: "pear-sync-invite-code",
      text: this.invite,
    });

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("Copy to clipboard").onClick(() => {
        navigator.clipboard.writeText(this.invite).catch(console.error);
        btn.setButtonText("Copied!");
        setTimeout(() => btn.setButtonText("Copy to clipboard"), 2000);
      })
    );

    new Setting(contentEl).addButton((btn) =>
      btn.setButtonText("Close").onClick(() => this.close())
    );
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
