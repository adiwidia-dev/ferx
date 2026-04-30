// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import { clearRuntimeBadges } from "$lib/services/runtime-badges.svelte";
import {
  WORKSPACES_STATE_KEY,
  WORKSPACES_STATE_VERSION,
  type WorkspaceGroupsState,
} from "$lib/services/workspace-groups";
import WorkspacePage from "./+page.svelte";

const invoke = vi.hoisted(() => vi.fn());
const listen = vi.hoisted(() =>
  vi.fn((_event: string, _callback: (event: { payload: unknown }) => void) =>
    Promise.resolve(() => {}),
  ),
);

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
    clearRuntimeBadges();
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

  it("opens the workspace picker from one click after native webviews are hidden", async () => {
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

  it("opens the add service dialog from one click after native webviews are hidden", async () => {
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

  it("shows the existing native service context menu directly", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>('button[title="YouTube Music (Cmd+1)"]')
      ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await settle();

    expect(invoke).toHaveBeenCalledWith("show_context_menu", {
      id: "youtube",
      disabled: false,
    });

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

  it("keeps runtime notification badges after the workspace page remounts", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    listen.mockImplementation((event, callback) => {
      listeners.set(event, callback as (event: { payload: unknown }) => void);
      return Promise.resolve(() => {});
    });

    let component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    listeners.get("update-badge")?.({ payload: "youtube:8" });
    await settle();

    expect(
      document.querySelector<HTMLElement>('[title="YouTube Music (Cmd+1)"]')?.textContent,
    ).toContain("8");

    unmount(component);
    document.body.innerHTML = "";

    component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    expect(
      document.querySelector<HTMLElement>('[title="YouTube Music (Cmd+1)"]')?.textContent,
    ).toContain("8");

    unmount(component);
  });
});
