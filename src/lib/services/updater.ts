import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdaterState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; version: string; notes: string | null; update: Update }
  | { status: "downloading"; version: string; downloaded: number; total: number | null }
  | { status: "installed"; version: string }
  | { status: "error"; message: string };

// Checks the configured updater endpoint for a newer release.
// Returns `null` when the running version is already current.
export async function checkForUpdate(): Promise<Update | null> {
  return await check();
}

// Downloads and installs the update, forwarding byte-level progress.
// On macOS the running bundle is replaced in place; a relaunch is still required
// because the webview process keeps the old binary mapped until exit.
export async function downloadAndInstall(
  update: Update,
  onProgress: (downloaded: number, total: number | null) => void,
): Promise<void> {
  let downloaded = 0;
  let total: number | null = null;

  await update.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null;
      onProgress(0, total);
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress(downloaded, total);
    }
  });
}

export async function relaunchApp(): Promise<void> {
  await relaunch();
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}
