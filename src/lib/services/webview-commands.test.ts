import { describe, expect, it, vi } from "vitest";

import {
  closeServiceWebview,
  createWebviewCommandQueue,
  deleteServiceWebview,
  hideAllWebviews,
  openServiceWebview,
  preloadBackgroundServices,
  reloadServiceWebview,
  setAllServiceWebviewsAudioMuted,
  setServiceWebviewAudioMuted,
  setRightPanelWidth,
  showServiceContextMenu,
} from "./webview-commands";

function createService(overrides: Partial<Parameters<typeof openServiceWebview>[0]> = {}) {
  return {
    id: "chat",
    url: "https://chat.example.com",
    storageKey: "storage-chat",
    notificationPrefs: {
      showBadge: true,
      affectTray: true,
      muteAudio: false,
    },
    ...overrides,
  };
}

describe("webview command wrappers", () => {
  it("keeps native command names and payloads explicit", async () => {
    const invokeCommand = vi.fn(() => Promise.resolve());
    const service = createService();

    await hideAllWebviews(invokeCommand);
    await openServiceWebview(service, false, true, invokeCommand);
    await reloadServiceWebview("chat", invokeCommand);
    await closeServiceWebview("chat", invokeCommand);
    await deleteServiceWebview({ id: "chat", storageKey: "storage-chat" }, invokeCommand);
    await setRightPanelWidth(360, invokeCommand);
    await setAllServiceWebviewsAudioMuted(true, invokeCommand);
    await showServiceContextMenu(
      "chat",
      true,
      { showBadge: true, affectTray: true, muteAudio: false },
      invokeCommand,
    );
    await setServiceWebviewAudioMuted("chat", true, invokeCommand);

    expect(invokeCommand).toHaveBeenNthCalledWith(1, "hide_all_webviews");
    expect(invokeCommand).toHaveBeenNthCalledWith(
      2,
      "open_service",
      expect.objectContaining({
        payload: expect.objectContaining({
          id: "chat",
          url: "https://chat.example.com",
          storageKey: "storage-chat",
          allowNotifications: true,
          badgeMonitoringEnabled: true,
          spellCheckEnabled: false,
          resourceUsageMonitoringEnabled: true,
        }),
      }),
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(3, "reload_webview", {
      payload: { id: "chat" },
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(4, "close_webview", {
      payload: { id: "chat" },
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(5, "delete_webview", {
      payload: {
        id: "chat",
        storageKey: "storage-chat",
      },
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(6, "set_right_panel_width", {
      payload: { width: 360 },
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(7, "set_all_service_webviews_audio_muted", {
      payload: { muted: true },
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(8, "show_context_menu", {
      id: "chat",
      disabled: true,
      showBadge: true,
      affectTray: true,
      muteAudio: false,
    });
    expect(invokeCommand).toHaveBeenNthCalledWith(9, "set_service_webview_audio_muted", {
      payload: { id: "chat", muted: true },
    });
  });
});

describe("createWebviewCommandQueue", () => {
  it("runs later commands after earlier commands settle", async () => {
    const queue = createWebviewCommandQueue();
    const order: string[] = [];
    let resolveFirst: () => void = () => {};

    queue.run(
      () =>
        new Promise<void>((resolve) => {
          order.push("first:start");
          resolveFirst = () => {
            order.push("first:end");
            resolve();
          };
        }),
    );
    queue.run(async () => {
      order.push("second");
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    resolveFirst();
    await queue.idle();

    expect(order).toEqual(["first:start", "first:end", "second"]);
  });

  it("skips pending stale commands when an interrupting command is queued", async () => {
    const queue = createWebviewCommandQueue();
    const order: string[] = [];
    let resolveFirst: () => void = () => {};

    queue.run(
      () =>
        new Promise<void>((resolve) => {
          order.push("first:start");
          resolveFirst = () => {
            order.push("first:end");
            resolve();
          };
        }),
    );
    queue.run(
      async () => {
        order.push("stale-open");
      },
      { interruptible: true },
    );
    queue.interrupt(async () => {
      order.push("hide");
    });

    await Promise.resolve();
    expect(order).toEqual(["first:start"]);

    resolveFirst();
    await queue.idle();

    expect(order).toEqual(["first:start", "first:end", "hide"]);
  });
});

describe("preloadBackgroundServices", () => {
  it("preloads enabled non-active services up to the configured cap", async () => {
    const invokeCommand = vi.fn(() => Promise.resolve());
    const sleep = vi.fn(() => Promise.resolve());

    await preloadBackgroundServices({
      services: [
        createService({ id: "active" }),
        createService({ id: "one" }),
        createService({ id: "disabled", disabled: true }),
        createService({ id: "two" }),
        createService({ id: "three" }),
      ],
      activeId: "active",
      spellCheckEnabled: true,
      maxPreloads: 2,
      gapMs: 1000,
      shouldCancel: () => false,
      sleep,
      invokeCommand,
    });

    expect(invokeCommand).toHaveBeenCalledTimes(2);
    expect(invokeCommand).toHaveBeenNthCalledWith(
      1,
      "load_service",
      expect.objectContaining({
        payload: expect.objectContaining({
          id: "one",
          resourceUsageMonitoringEnabled: false,
        }),
      }),
    );
    expect(invokeCommand).toHaveBeenNthCalledWith(
      2,
      "load_service",
      expect.objectContaining({
        payload: expect.objectContaining({
          id: "two",
          resourceUsageMonitoringEnabled: false,
        }),
      }),
    );
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(1000);
  });
});
