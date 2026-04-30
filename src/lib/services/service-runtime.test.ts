import { describe, expect, it } from "vitest";

import {
  createDeleteWebviewPayload,
  createRightPanelWidthPayload,
  createServiceWebviewPayload,
  createWebviewIdPayload,
  shouldPreloadService,
} from "./service-runtime";

function createService(overrides: {
  id?: string;
  url?: string;
  storageKey?: string;
  disabled?: boolean;
  showBadge?: boolean;
  affectTray?: boolean;
  muteAudio?: boolean;
} = {}) {
  return {
    id: overrides.id ?? "service-1",
    url: overrides.url ?? "https://example.com/app",
    storageKey: overrides.storageKey ?? "storage-service-1",
    disabled: overrides.disabled,
    notificationPrefs: {
      showBadge: overrides.showBadge ?? true,
      affectTray: overrides.affectTray ?? true,
      muteAudio: overrides.muteAudio ?? false,
    },
  };
}

describe("createServiceWebviewPayload", () => {
  it("returns the runtime load payload for a service", () => {
    expect(
      createServiceWebviewPayload(
        createService({
          id: "docs",
          url: "https://docs.example.com/",
          storageKey: "storage-docs",
          muteAudio: true,
        }),
        true,
      ),
    ).toEqual({
      id: "docs",
      url: "https://docs.example.com/",
      storageKey: "storage-docs",
      allowNotifications: true,
      badgeMonitoringEnabled: true,
      spellCheckEnabled: true,
      resourceUsageMonitoringEnabled: false,
    });
  });

  it("includes resource usage monitoring when requested", () => {
    expect(createServiceWebviewPayload(createService(), true, true)).toMatchObject({
      resourceUsageMonitoringEnabled: true,
    });
  });

  it("disables badge monitoring only when both badge and tray are off", () => {
    expect(
      createServiceWebviewPayload(
        createService({
          showBadge: false,
          affectTray: false,
        }),
        false,
      ),
    ).toMatchObject({
      badgeMonitoringEnabled: false,
      spellCheckEnabled: false,
    });
  });
});

describe("createDeleteWebviewPayload", () => {
  it("returns the runtime delete payload for a service", () => {
    expect(
      createDeleteWebviewPayload(
        createService({ id: "chat", storageKey: "storage-chat" }),
      ),
    ).toEqual({
      id: "chat",
      storageKey: "storage-chat",
    });
  });
});

describe("shared command payload helpers", () => {
  it("creates webview id payloads", () => {
    expect(createWebviewIdPayload("chat")).toEqual({ id: "chat" });
  });

  it("creates right panel width payloads", () => {
    expect(createRightPanelWidthPayload(360)).toEqual({ width: 360 });
  });
});

describe("shouldPreloadService", () => {
  it("skips the active service", () => {
    expect(shouldPreloadService(createService({ id: "active" }), "active")).toBe(false);
  });

  it("skips disabled services", () => {
    expect(shouldPreloadService(createService({ id: "disabled", disabled: true }), "other")).toBe(
      false,
    );
  });

  it("preloads enabled inactive services", () => {
    expect(shouldPreloadService(createService({ id: "docs" }), "active")).toBe(true);
  });
});
