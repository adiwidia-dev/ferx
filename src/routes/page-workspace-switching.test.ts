// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import {
  WORKSPACES_STATE_KEY,
  WORKSPACES_STATE_VERSION,
  type WorkspaceGroupsState,
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

function createWorkspaceState(): WorkspaceGroupsState {
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

async function waitFor(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

    for (const resolveHide of hideResolvers) {
      resolveHide();
    }
    await settle();

    const personalButton = Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Personal"),
    ) as HTMLButtonElement | undefined;
    personalButton?.click();
    await settle();

    for (const resolveHide of hideResolvers.splice(0)) {
      resolveHide();
    }
    await settle();

    expect(invoke).toHaveBeenCalledWith(
      "open_service",
      expect.objectContaining({ payload: expect.objectContaining({ id: "gemini" }) }),
    );

    unmount(component);
  });

  it("waits for native webviews to hide before showing the workspace picker overlay", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    let resolveHide = () => {};
    invoke.mockImplementation((command) => {
      if (command === "hide_all_webviews") {
        return new Promise((resolve) => {
          resolveHide = () => resolve(undefined);
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
    expect(document.querySelector('[data-testid="workspace-picker-panel"]')).toBeNull();

    resolveHide();
    await settle();

    expect(document.querySelector('[data-testid="workspace-picker-panel"]')).toBeTruthy();

    unmount(component);
  });

  it("waits for native webviews to hide before showing the add service dialog", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    let resolveHide = () => {};
    invoke.mockImplementation((command) => {
      if (command === "hide_all_webviews") {
        return new Promise((resolve) => {
          resolveHide = () => resolve(undefined);
        });
      }

      return Promise.resolve();
    });

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>('button[title="Add Service"]')?.click();
    await waitFor(60);

    expect(invoke).toHaveBeenCalledWith("hide_all_webviews");
    expect(document.body.textContent).not.toContain("Add New Service");

    resolveHide();
    await settle();

    expect(document.body.textContent).toContain("Add New Service");

    unmount(component);
  });

  it("closes disabled workspace services without deleting their session storage", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-switcher-trigger"]',
    )?.click();
    await settle();

    document.querySelector<HTMLButtonElement>(
      'button[aria-label="Disable Personal workspace"]',
    )?.click();
    await settle();

    expect(invoke).toHaveBeenCalledWith("close_webview", { payload: { id: "gemini" } });
    expect(invoke).not.toHaveBeenCalledWith(
      "delete_webview",
      expect.objectContaining({ payload: expect.objectContaining({ id: "gemini" }) }),
    );

    unmount(component);
  });

  it("closes only orphaned service webviews when deleting a workspace", async () => {
    const state = createWorkspaceState();
    state.workspaces[0].serviceIds.push("shared");
    state.workspaces[1].serviceIds.push("shared");
    state.servicesById.shared = {
      id: "shared",
      name: "Shared",
      url: "https://shared.example.com/",
      storageKey: "storage-shared",
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
    };
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>(
      '[data-testid="workspace-switcher-trigger"]',
    )?.click();
    await settle();

    document.querySelector<HTMLButtonElement>(
      'button[aria-label="Delete Personal workspace"]',
    )?.click();
    await settle();
    document.querySelector<HTMLButtonElement>(
      'button[aria-label="Confirm delete Personal workspace"]',
    )?.click();
    await settle();

    expect(invoke).toHaveBeenCalledWith("close_webview", { payload: { id: "gemini" } });
    expect(invoke).not.toHaveBeenCalledWith("close_webview", { payload: { id: "shared" } });
    expect(invoke).not.toHaveBeenCalledWith(
      "delete_webview",
      expect.objectContaining({ payload: expect.objectContaining({ id: "gemini" }) }),
    );

    unmount(component);
  });
});
