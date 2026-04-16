import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  parseVersion,
  isNewerVersion,
  findDmgAsset,
  checkForUpdate,
} from "./update-check";

describe("parseVersion", () => {
  it("parses a plain semver string", () => {
    expect(parseVersion("1.2.3")).toEqual([1, 2, 3]);
  });

  it("strips a leading v prefix", () => {
    expect(parseVersion("v0.1.0")).toEqual([0, 1, 0]);
  });

  it("handles non-numeric parts as zero", () => {
    expect(parseVersion("1.beta.3")).toEqual([1, 0, 3]);
  });
});

describe("isNewerVersion", () => {
  it("returns true when latest major is higher", () => {
    expect(isNewerVersion("2.0.0", "1.0.0")).toBe(true);
  });

  it("returns true when latest minor is higher", () => {
    expect(isNewerVersion("0.2.0", "0.1.0")).toBe(true);
  });

  it("returns true when latest patch is higher", () => {
    expect(isNewerVersion("0.1.1", "0.1.0")).toBe(true);
  });

  it("returns false when versions are equal", () => {
    expect(isNewerVersion("0.1.0", "0.1.0")).toBe(false);
  });

  it("returns false when current is newer", () => {
    expect(isNewerVersion("0.1.0", "0.2.0")).toBe(false);
  });

  it("handles v-prefix on both sides", () => {
    expect(isNewerVersion("v1.0.0", "v0.9.0")).toBe(true);
  });

  it("handles different segment lengths", () => {
    expect(isNewerVersion("1.0.0.1", "1.0.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0.1")).toBe(false);
  });
});

describe("findDmgAsset", () => {
  it("returns the download URL for a .dmg asset", () => {
    const assets = [
      { name: "Ferx_0.2.0_universal.dmg", browser_download_url: "https://example.com/ferx.dmg" },
      { name: "checksums.txt", browser_download_url: "https://example.com/checksums.txt" },
    ];
    expect(findDmgAsset(assets)).toBe("https://example.com/ferx.dmg");
  });

  it("returns null when no .dmg asset exists", () => {
    const assets = [
      { name: "checksums.txt", browser_download_url: "https://example.com/checksums.txt" },
    ];
    expect(findDmgAsset(assets)).toBeNull();
  });

  it("returns null for an empty asset list", () => {
    expect(findDmgAsset([])).toBeNull();
  });
});

describe("checkForUpdate", () => {
  const mockRelease = {
    tag_name: "v0.2.0",
    name: "v0.2.0",
    body: "Release notes here",
    html_url: "https://github.com/adiwidia-dev/ferx/releases/tag/v0.2.0",
    published_at: "2026-04-16T00:00:00Z",
    assets: [
      {
        name: "Ferx_0.2.0_universal.dmg",
        browser_download_url: "https://github.com/adiwidia-dev/ferx/releases/download/v0.2.0/Ferx_0.2.0_universal.dmg",
      },
    ],
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns update-available when a newer version exists", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRelease),
    } as Response);

    const result = await checkForUpdate("0.1.0");

    expect(result.status).toBe("update-available");
    if (result.status === "update-available") {
      expect(result.release.version).toBe("0.2.0");
      expect(result.release.dmgDownloadUrl).toContain("Ferx_0.2.0_universal.dmg");
      expect(result.currentVersion).toBe("0.1.0");
    }
  });

  it("returns up-to-date when on the latest version", async () => {
    const sameVersionRelease = { ...mockRelease, tag_name: "v0.1.0" };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sameVersionRelease),
    } as Response);

    const result = await checkForUpdate("0.1.0");
    expect(result).toEqual({ status: "up-to-date", currentVersion: "0.1.0" });
  });

  it("returns error when the API responds with a non-ok status", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 403,
    } as Response);

    const result = await checkForUpdate("0.1.0");
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.message).toContain("403");
    }
  });

  it("returns error when the fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));

    const result = await checkForUpdate("0.1.0");
    expect(result).toEqual({ status: "error", message: "Network error" });
  });
});
