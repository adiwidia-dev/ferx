// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  afterEach(() => {
    vi.useRealTimers();
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
        payload: expect.objectContaining({
          id: "chat",
          allowNotifications: true,
          badgeMonitoringEnabled: true,
          spellCheckEnabled: false,
          resourceUsageMonitoringEnabled: false,
        }),
      }),
    );

    unmount(component);
  });

  it("limits startup background service preloads from persisted app settings", async () => {
    vi.useFakeTimers();
    invoke.mockResolvedValue(undefined);
    localStorage.setItem(
      "ferx-workspace-services",
      JSON.stringify([
        {
          id: "active",
          name: "Active",
          url: "https://active.example.com/",
          storageKey: "storage-active",
          notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        },
        {
          id: "one",
          name: "One",
          url: "https://one.example.com/",
          storageKey: "storage-one",
          notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        },
        {
          id: "two",
          name: "Two",
          url: "https://two.example.com/",
          storageKey: "storage-two",
          notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
        },
      ]),
    );
    localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        spellCheckEnabled: true,
        resourceUsageMonitoringEnabled: false,
        startupPreloadLimit: 1,
      }),
    );

    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(2000);
    flushSync();

    const preloadCalls = invoke.mock.calls.filter(([command]) => command === "load_service");
    expect(preloadCalls).toHaveLength(1);
    expect(preloadCalls[0]?.[1]).toEqual(
      expect.objectContaining({
        payload: expect.objectContaining({
          id: "one",
          spellCheckEnabled: true,
        }),
      }),
    );

    unmount(component);
  });

  it("shows the resource usage strip and opens the active service with monitoring enabled", async () => {
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
      JSON.stringify({
        spellCheckEnabled: true,
        resourceUsageMonitoringEnabled: true,
      }),
    );

    const component = mount(WorkspacePage, {
      target: document.body,
    });

    flushSync();
    await Promise.resolve();
    flushSync();

    expect(document.querySelector('[data-testid="resource-usage-strip"]')).toBeTruthy();
    expect(document.body.textContent).toContain("Chat");
    expect(document.body.textContent).toContain("CPU est. N/A");
    expect(document.body.textContent).not.toContain("Mem est.");
    expect(document.body.textContent).toContain("Down observed N/A");
    expect(document.body.textContent).toContain("Up observed N/A");
    expect(invoke).toHaveBeenCalledWith(
      "open_service",
      expect.objectContaining({
        payload: expect.objectContaining({
          id: "chat",
          resourceUsageMonitoringEnabled: true,
        }),
      }),
    );

    unmount(component);
  });
});
