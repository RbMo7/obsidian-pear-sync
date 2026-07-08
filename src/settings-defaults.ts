export interface PearSyncSettings {
  seedPhrase: string;
  remoteKey: string;   // hex drive key — set when joining another device's vault
  lastSyncTimestamp: number;
}

export const DEFAULT_SETTINGS: PearSyncSettings = {
  seedPhrase: "",
  remoteKey: "",
  lastSyncTimestamp: 0,
};

export interface PearSyncPluginState {
  connectedPeers: number;
  isSyncing: boolean;
  isStarting: boolean;
  driveReady: boolean;
  currentInvite: string | null;
}

export const INITIAL_STATE: PearSyncPluginState = {
  connectedPeers: 0,
  isSyncing: false,
  isStarting: false,
  driveReady: false,
  currentInvite: null,
};
