import { spawn, execSync } from "child_process";
import { Duplex } from "stream";
import { WorkerCommand, WorkerEvent } from "./types";
import * as path from "path";
import * as fs from "fs";

export type WorkerEventHandler = (event: WorkerEvent) => void;

const WORKER_REL_PATH = "workers/main.mjs";

// Platform-specific Bare binary path relative to bare-sidecar package
const BARE_BINARY_REL_PATH = {
  darwin: { arm64: "darwin-arm64/bare", x64: "darwin-x64/bare" },
  linux: { arm64: "linux-arm64/bare", x64: "linux-x64/bare" },
  win32: { arm64: "win32-arm64/bare.exe", x64: "win32-x64/bare.exe" },
};

/**
 * Manages the Bare worker process lifecycle.
 *
 * Spawns the Bare binary directly as a child process and communicates
 * via NDJSON over the IPC channel (fd 3). This bypasses pear-runtime
 * entirely — avoids complex dependency bundling issues in Obsidian.
 */
export class WorkerBridge {
  private worker: Duplex | null = null;
  private process: import("child_process").ChildProcess | null = null;
  private buffer = "";
  private eventHandler: WorkerEventHandler;
  private initPromise: ((value: void) => void) | null = null;

  constructor(eventHandler: WorkerEventHandler) {
    this.eventHandler = eventHandler;
  }

  get running(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Wrap the user's event handler so we can intercept init-complete.
   */
  private handleEvent(event: WorkerEvent): void {
    if (event.type === "init-complete" && this.initPromise) {
      this.initPromise();
      this.initPromise = null;
    }
    this.eventHandler(event);
  }

  /**
   * Resolve the Bare binary path from bare-sidecar's prebuilds.
   */
  private resolveBareBinary(pluginDir: string): string {
    const platform = process.platform as keyof typeof BARE_BINARY_REL_PATH;
    const arch = process.arch as "arm64" | "x64";
    const binaryRel = BARE_BINARY_REL_PATH[platform]?.[arch];
    if (!binaryRel) {
      throw new Error(
        `Unsupported platform: ${process.platform}-${process.arch}`
      );
    }
    return path.join(
      pluginDir,
      "node_modules",
      "bare-sidecar",
      "prebuilds",
      binaryRel
    );
  }

  /**
   * Spawn the Bare worker. Sends init command once worker is ready.
   */
  async start(pluginDir: string, seedPhrase: string): Promise<void> {
    if (this.process) throw new Error("Worker already running");

    const bareBinary = this.resolveBareBinary(pluginDir);
    const workerPath = path.join(pluginDir, WORKER_REL_PATH);
    const storePath = path.join(pluginDir, "data", "corestore");

    // Kill any stale Bare workers from previous plugin instances
    this.killStaleWorkers(workerPath);

    // Clean stale lock files
    this.cleanLocks(storePath);

    // Ensure the binary is executable
    try {
      fs.accessSync(bareBinary, fs.constants.X_OK);
    } catch {
      fs.chmodSync(bareBinary, 0o755);
    }

    this.process = spawn(bareBinary, [workerPath], {
      stdio: ["pipe", "pipe", "pipe", "overlapped"],
    });

    // IPC is on fd 3 (exactly like bare-sidecar does internally)
    const ipc = this.process.stdio[3] as Duplex | null;
    if (!ipc) {
      throw new Error("IPC channel (fd 3) not available");
    }
    this.worker = ipc;

    // Forward worker stdout/stderr for logging (not IPC)
    this.process.stdout?.on("data", (d) =>
      console.log("[pear-worker]", d.toString().trim())
    );
    this.process.stderr?.on("data", (d) =>
      console.error("[pear-worker]", d.toString().trim())
    );

    // Parse NDJSON from IPC channel
    this.worker.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            const event: WorkerEvent = JSON.parse(trimmed);
            this.handleEvent(event);
          } catch (err) {
            console.error("[Pear Sync] parse error:", err);
          }
        }
      }
    });

    this.worker.on("error", (err: Error) => {
      console.error("[Pear Sync] Worker IPC error:", err);
    });

    this.process.on("exit", (code) => {
      console.log("[Pear Sync] Worker exited with code", code);
      this.process = null;
      this.worker = null;
    });

    // Send init command and wait for init-complete response
    const initDone = new Promise<void>((resolve) => {
      this.initPromise = resolve;
    });
    await this.sendCommand({ type: "init", seedPhrase, storePath });

    // Timeout: if init doesn't complete in 15s, reject
    const timeout = setTimeout(() => {
      console.error("[Pear Sync] Worker init timed out");
      this.initPromise = null;
    }, 15000);

    await initDone;
    clearTimeout(timeout);
    console.log("[Pear Sync] Worker initialised");
  }

  async sendCommand(cmd: WorkerCommand): Promise<void> {
    if (!this.worker) throw new Error("Worker not running");
    this.worker.write(JSON.stringify(cmd) + "\n");
  }

  async upsertFile(filePath: string, data: ArrayBuffer): Promise<void> {
    this.worker?.write(
      JSON.stringify({
        type: "upsert-file",
        path: filePath,
        data: arrayBufferToBase64(data),
      }) + "\n"
    );
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.sendCommand({ type: "delete-file", path: filePath });
  }

  async getInvite(): Promise<void> {
    await this.sendCommand({ type: "get-invite" });
  }

  async stop(): Promise<void> {
    try {
      if (this.worker) {
        this.worker.write(JSON.stringify({ type: "shutdown" }) + "\n");
        await new Promise((r) => setTimeout(r, 500));
        this.worker.end();
      }
    } catch {
      // Process already dead
    }
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.worker = null;
  }

  /**
   * Remove any stale lock files left by killed worker processes.
   * Hypercore/Corestore uses random-access-file which creates
   * a LOCK file that persists if the process is killed.
   */
  /**
   * Kill all Bare worker processes that are running the same worker file.
   * These accumulate when Obsidian reloads without properly killing children.
   */
  private killStaleWorkers(workerPath: string): void {
    try {
      const result = execSync(
        `pgrep -f "bare.*${path.basename(workerPath)}"`,
        { encoding: "utf8", timeout: 3000 }
      );
      const pids = result.trim().split("\n").filter(Boolean);
      if (pids.length > 0) {
        execSync(`kill ${pids.join(" ")}`, { timeout: 2000 });
        console.log("[Pear Sync] Killed", pids.length, "stale worker(s)");
      }
    } catch {
      // pgrep returned non-zero = no matching processes, or platform doesn't have pgrep
    }
  }

  private cleanLocks(storePath: string): void {
    try {
      const entries = fs.readdirSync(storePath);
      for (const entry of entries) {
        if (entry.endsWith(".lock") || entry === "LOCK") {
          const lockPath = path.join(storePath, entry);
          fs.unlinkSync(lockPath);
          console.log("[Pear Sync] Cleaned lock:", entry);
        }
      }
    } catch {
      // Directory doesn't exist yet — first run
    }
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
