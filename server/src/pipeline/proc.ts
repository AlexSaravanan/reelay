import { spawn } from "node:child_process";

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Called with each chunk of stderr, for live progress parsing. */
  onStderr?: (chunk: string) => void;
  onStdout?: (chunk: string) => void;
  cwd?: string;
  /** Abort signal — when fired, the child is killed and run() rejects. */
  signal?: AbortSignal;
}

/** Error thrown when a run is cancelled via its AbortSignal. */
export class CancelledError extends Error {
  constructor() {
    super("Cancelled.");
    this.name = "CancelledError";
  }
}

/** Spawn a command, collect output, resolve/reject on exit. */
export function run(
  bin: string,
  args: string[],
  opts: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (opts.signal?.aborted) {
      reject(new CancelledError());
      return;
    }
    const child = spawn(bin, args, { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let cancelled = false;

    const onAbort = () => {
      cancelled = true;
      child.kill("SIGKILL");
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      opts.onStdout?.(s);
    });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      opts.onStderr?.(s);
    });

    child.on("error", (err) => {
      opts.signal?.removeEventListener("abort", onAbort);
      reject(
        new Error(
          `Failed to launch "${bin}": ${err.message}. Is it installed and on PATH?`,
        ),
      );
    });
    child.on("close", (code) => {
      opts.signal?.removeEventListener("abort", onAbort);
      if (cancelled) {
        reject(new CancelledError());
      } else if (code === 0) {
        resolve({ code: 0, stdout, stderr });
      } else {
        reject(
          new Error(
            `${bin} exited with code ${code}.\n${stderr.slice(-2000)}`,
          ),
        );
      }
    });
  });
}
