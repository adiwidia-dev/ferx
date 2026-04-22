import { beforeEach, describe, expect, it, vi } from "vitest";

const checkMock = vi.fn();
const relaunchMock = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: (...args: unknown[]) => checkMock(...args),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: (...args: unknown[]) => relaunchMock(...args),
}));

import {
  checkForUpdate,
  downloadAndInstall,
  formatErrorMessage,
  relaunchApp,
} from "./updater";

describe("checkForUpdate", () => {
  beforeEach(() => {
    checkMock.mockReset();
  });

  it("returns null when the running version is current", async () => {
    checkMock.mockResolvedValueOnce(null);

    await expect(checkForUpdate()).resolves.toBeNull();
    expect(checkMock).toHaveBeenCalledTimes(1);
  });

  it("returns the update descriptor when one is available", async () => {
    const update = { version: "0.2.0", body: "notes" };
    checkMock.mockResolvedValueOnce(update);

    await expect(checkForUpdate()).resolves.toBe(update);
  });
});

describe("downloadAndInstall", () => {
  it("reports progress for Started and Progress events, skipping Finished", async () => {
    const downloadAndInstallMock = vi.fn(async (handler: (event: unknown) => void) => {
      handler({ event: "Started", data: { contentLength: 1000 } });
      handler({ event: "Progress", data: { chunkLength: 200 } });
      handler({ event: "Progress", data: { chunkLength: 300 } });
      handler({ event: "Finished" });
    });
    const update = { downloadAndInstall: downloadAndInstallMock } as unknown as Parameters<
      typeof downloadAndInstall
    >[0];

    const progress: Array<[number, number | null]> = [];
    await downloadAndInstall(update, (downloaded, total) => progress.push([downloaded, total]));

    expect(progress).toEqual([
      [0, 1000],
      [200, 1000],
      [500, 1000],
    ]);
  });

  it("handles updates without contentLength by reporting null total", async () => {
    const downloadAndInstallMock = vi.fn(async (handler: (event: unknown) => void) => {
      handler({ event: "Started", data: {} });
      handler({ event: "Progress", data: { chunkLength: 123 } });
    });
    const update = { downloadAndInstall: downloadAndInstallMock } as unknown as Parameters<
      typeof downloadAndInstall
    >[0];

    const progress: Array<[number, number | null]> = [];
    await downloadAndInstall(update, (downloaded, total) => progress.push([downloaded, total]));

    expect(progress).toEqual([
      [0, null],
      [123, null],
    ]);
  });
});

describe("relaunchApp", () => {
  beforeEach(() => {
    relaunchMock.mockReset();
  });

  it("delegates to tauri-plugin-process", async () => {
    relaunchMock.mockResolvedValueOnce(undefined);

    await relaunchApp();

    expect(relaunchMock).toHaveBeenCalledTimes(1);
  });
});

describe("formatErrorMessage", () => {
  it("extracts message from Error instances", () => {
    expect(formatErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("returns plain strings as-is", () => {
    expect(formatErrorMessage("network down")).toBe("network down");
  });

  it("falls back to a generic label for unknown values", () => {
    expect(formatErrorMessage({ unexpected: true })).toBe("Unknown error");
    expect(formatErrorMessage(undefined)).toBe("Unknown error");
  });
});
