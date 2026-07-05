export type WorkerCommand =
  | { type: "init"; seedPhrase: string; storePath: string }
  | { type: "upsert-file"; path: string; data: string }
  | { type: "delete-file"; path: string }
  | { type: "get-invite" }
  | { type: "shutdown" };

export type WorkerEvent =
  | { type: "init-complete"; key: string; discoveryKey: string }
  | { type: "upsert-done"; path: string }
  | { type: "delete-done"; path: string }
  | { type: "invite"; invite: string }
  | { type: "peer-count"; count: number }
  | { type: "error"; message: string }
  | { type: "shutdown-complete" };
