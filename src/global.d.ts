// The Bare globals (Bare.IPC, Bare.argv) are available only inside Bare workers,
// not in the plugin process. This declaration is for reference only.
declare const Bare: {
  IPC: import("stream").Duplex;
  argv: string[];
  platform: string;
  arch: string;
  version: string;
} | undefined;
