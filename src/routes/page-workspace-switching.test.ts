// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import {
  WORKSPACES_STATE_KEY,
  WORKSPACES_STATE_VERSION,
} from "$lib/services/workspace-groups";
import WorkspacePage from "./+page.svelte";

const invoke = vi.hoisted(() => vi.fn());
const listen = vi.hoisted(() => vi.fn(() => Promise.resolve(() => {})));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen,
}));

function createWorkspaceState() {
  return {
    version: WORKSPACES_STATE_VERSION,
    currentWorkspaceId: "default",
    workspaces: [
      {
        id: "default",
        name: "Default",
        serviceIds: ["youtube"],
        activeServiceId: "youtube",
        icon: "briefcase",
      },
      {
        id: "personal",
        name: "Personal",
        serviceIds: ["gemini"],
        activeServiceId: "gemini",
        icon: "user",
      },
    ],
    servicesById: {
      youtube: {
        id: "youtube",
        name: "YouTube Music",
        url: "https://music.youtube.com/",
        storageKey: "storage-youtube",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
      gemini: {
        id: "gemini",
        name: "Gemini",
        url: "https://gemini.google.com/app",
        storageKey: "storage-gemini",
        notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      },
    },
  };
}

async function settle() {
  flushSync();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushSync();
}

describe("workspace switching webview commands", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    invoke.mockReset();
    listen.mockClear();
  });

  it("waits for picker webviews to hide before opening the selected workspace service", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    const hideResolvers: Array<() => void> = [];
    invoke.mockImplementation((command) => {
      if (command === "hide_all_webviews") {
        return new Promise((resolve) => {
          hideResolvers.push(() => resolve(undefined));
        });
      }

      return Promise.resolve();
    });

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-switcher-trigger"]',
    )?.click();
    await settle();

    expect(invoke).toHaveBeenCalledWith("hide_all_webviews");

    const personalButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Personal"),
    ) as HTMLButtonElement | undefined;
    personalButton?.click();
    await settle();

    expect(invoke).not.toHaveBeenCalledWith(
      "open_service",
      expect.objectContaining({ id: "gemini" }),
    );

    for (const resolveHide of hideResolvers) {
      resolveHide();
    }
    await settle();

    expect(invoke).toHaveBeenCalledWith(
      "open_service",
      expect.objectContaining({ id: "gemini" }),
    );

    unmount(component);
  });
});
