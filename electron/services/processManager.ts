import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import electron from "electron";

const { shell } = electron;
import psList from "ps-list";
import { AppDefinition } from "./paths.js";

export interface ProcessManager {
  isRunning(definition: AppDefinition): Promise<boolean>;
  close(definition: AppDefinition): Promise<void>;
  launch(executablePath: string, definition?: AppDefinition): Promise<void>;
}

export class CrossPlatformProcessManager implements ProcessManager {
  async isRunning(definition: AppDefinition): Promise<boolean> {
    const running = await psList();
    return running.some((proc) => matchesProcessName(definition, proc.name, proc.cmd));
  }

  async close(definition: AppDefinition): Promise<void> {
    if (!await this.isRunning(definition)) {
      return;
    }

    const targets = await this.findMatchingProcesses(definition);
    for (const proc of targets) {
      try {
        process.kill(proc.pid, "SIGTERM");
      } catch {
        // Process may already be gone.
      }
    }

    if (!await this.waitUntilStopped(definition, 10_000)) {
      const remaining = await this.findMatchingProcesses(definition);
      for (const proc of remaining) {
        try {
          process.kill(proc.pid, "SIGKILL");
        } catch {
          // Ignore if already closed.
        }
      }
    }

    if (!await this.waitUntilStopped(definition, 10_000)) {
      throw new Error(`${definition.displayName} is still running after waiting 10 seconds for it to close.`);
    }
  }

  async launch(executablePath: string, definition?: AppDefinition): Promise<void> {
    try {
      await fs.access(executablePath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Codex / ChatGPT executable is not accessible: ${executablePath}. ${detail}`);
    }

    const appLabel = definition?.displayName ?? "Codex/ChatGPT";
    console.info(`[ProcessManager] launching ${appLabel} from: ${executablePath}${definition?.msixAumid ? ` (MSIX ${definition.msixAumid})` : ""}`);
    await this.launchWithShell(executablePath, definition?.msixAumid);
    if (await this.confirmRunning(definition)) {
      console.info(`[ProcessManager] ${appLabel} process confirmed running.`);
      return;
    }

    // Log current process matches at this point for diagnostics.
    try {
      const matches = await this.findMatchingProcesses(definition ?? { processNames: [], displayName: "Codex", sourceRoots: [], defaultExecutablePath: "" });
      const summary = matches.map((proc) => `${proc.pid}:${proc.name}`).join(", ") || "none";
      console.warn(`[ProcessManager] process matches at confirmation-fail time: ${summary}`);
    } catch (psError) {
      console.warn(`[ProcessManager] could not enumerate process list: ${psError}`);
    }

    // Profile files are already swapped - log a warning but do not block the
    // user. The app may appear shortly after the confirmation window closes.
    console.warn(
      `[ProcessManager] ${appLabel} launched from ${executablePath} but ` +
      `${definition?.processNames.join(" or ") ?? "the process"} was not yet ` +
      `visible in the process list after the confirmation window. It may still be starting.`
    );
  }

  /**
   * Launch Codex via the appropriate platform mechanism.
   */
  private async launchWithShell(executablePath: string, msixAumid?: string): Promise<void> {
    if (process.platform === "win32" && msixAumid) {
      const shellArg = `shell:AppsFolder\\${msixAumid}`;
      console.info(`[ProcessManager] launching MSIX app: explorer.exe "${shellArg}"`);
      await new Promise<void>((resolve) => {
        const child = execFile("explorer.exe", [shellArg], { windowsHide: false }, () => {
          resolve();
        });
        child.unref();
      });
    } else {
      console.info(`[ProcessManager] launching via shell.openPath: ${executablePath}`);
      const error = await shell.openPath(executablePath);
      if (error) {
        throw new Error(`Could not launch Codex from ${executablePath}: ${error}`);
      }
    }
    // Brief pause before polling so the OS has time to start the process.
    await delay(500);
  }

  private async confirmRunning(definition: AppDefinition | undefined): Promise<boolean> {
    if (!definition) {
      await delay(2000);
      return true;
    }

    // Wait briefly for app activation to register the process.
    await delay(1500);

    // Poll up to ~6 seconds (8 x 750 ms).
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (await this.isRunning(definition)) {
        return true;
      }
      await delay(750);
    }
    return false;
  }

  private async waitUntilStopped(definition: AppDefinition, timeoutMs: number): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (!await this.isRunning(definition)) {
        return true;
      }
      await delay(500);
    }
    return !await this.isRunning(definition);
  }

  private async findMatchingProcesses(definition: AppDefinition): Promise<Array<{ pid: number; name: string }>> {
    const running = await psList();
    return running
      .filter((proc) => matchesProcessName(definition, proc.name, proc.cmd))
      .map((proc) => ({ pid: proc.pid, name: proc.name }));
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function matchesProcessName(definition: AppDefinition, processName: string, cmd?: string): boolean {
  const normalizedName = normalizeProcessLabel(processName);
  const normalizedCmdBase = normalizeProcessLabel(extractCommandBase(cmd));

  return definition.processNames.some((candidate) => {
    const normalizedCandidate = normalizeProcessLabel(candidate);
    return normalizedName === normalizedCandidate || normalizedCmdBase === normalizedCandidate;
  });
}

function extractCommandBase(cmd?: string): string {
  if (!cmd) {
    return "";
  }
  const firstToken = cmd.trim().split(/\s+/)[0] ?? "";
  const cleaned = firstToken.replace(/^"+|"+$/g, "");
  return cleaned.split(/[\\/]/).pop() ?? cleaned;
}

function normalizeProcessLabel(value: string): string {
  return value.trim().toLowerCase().replace(/\.exe$/i, "");
}
