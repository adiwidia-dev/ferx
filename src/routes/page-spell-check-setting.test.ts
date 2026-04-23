// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APP_SETTINGS_STORAGE_KEY } from "$lib/services/app-settings";
import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import WorkspacePage from "./+page.svelte";

const invoke = vi.hoisted(() => vi.fn());
const listen = vi.hoisted(() => vi.fn(() => Promise.resolve(() => {})));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen,
}));

describe("workspace spell-check startup setting", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    invoke.mockClear();
    listen.mockClear();
  });

  it("opens the active service with the persisted disabled spell-check setting after restart", async () => {
    localStorage.setItem(
      "ferx-workspace-services",
      JSON.stringify([
        {
          id: "chat",
          name: "Chat",
          url: "https://chat.example.com/",
          storageKey: "storage-chat",
          notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        },
      ]),
    );
    localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify({ spellCheckEnabled: false }),
    );

    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();
    await Promise.resolve();
    flushSync();

    expect(invoke).toHaveBeenCalledWith(
      "open_service",
      expect.objectContaining({
        id: "chat",
        allowNotifications: true,
        badgeMonitoringEnabled: true,
        spellCheckEnabled: false,
      }),
    );

    unmount(component);
  });
});
