/**
 * Diagnostics log — TUI-safe file sink for background diagnostics.
 *
 * Routes diagnostics that would otherwise go to the console (forbidden in the
 * TUI process — invariant 2: no raw stdout writes in the editor window) to
 * <agentDir>/pi-blackhole/diag.log as JSONL lines, rotated at 256 KB.
 *
 * Never throws: a failed diag write is dropped silently — logging must not
 * take down the host process. Synchronous append is intentional: writes are
 * tiny and rare (config validation, I/O failures).
 *
 * No-op under vitest (VITEST=true) so test runs never touch the real home dir.
 *
 * Local patch addition (#484): upstream 0.5.9 shipped 20 console calls in
 * src/; the TUI-safety pre-commit check blocks them, so they land here.
 */
import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { getPiAgentDir } from "./paths.js";

const DIAG_LOG_MAX_BYTES = 256 * 1024;
const DIAG_LOG_RELATIVE_PATH = join("pi-blackhole", "diag.log");

/**
 * Append one diagnostics line to the diag log. Never throws; never prints.
 * The message text is preserved verbatim (grep-friendly across versions).
 */
export function diagLog(message: string): void {
  if (process.env.VITEST === "true") return;
  try {
    const path = join(getPiAgentDir(), DIAG_LOG_RELATIVE_PATH);
    mkdirSync(dirname(path), { recursive: true });
    rotateIfNeeded(path);
    const line = JSON.stringify({ ts: new Date().toISOString(), msg: message }) + "\n";
    appendFileSync(path, line, "utf-8");
  } catch {
    // Diagnostics must never break the host process — drop the entry.
  }
}

function rotateIfNeeded(path: string): void {
  try {
    if (!existsSync(path) || statSync(path).size < DIAG_LOG_MAX_BYTES) return;
    const backupPath = `${path}.1`;
    if (existsSync(backupPath)) unlinkSync(backupPath);
    renameSync(path, backupPath);
  } catch {
    // Rotation failure is non-fatal: the next append may grow the file further.
  }
}
