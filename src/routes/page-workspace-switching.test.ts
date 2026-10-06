// @vitest-environment jsdom
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_NOTIFICATION_PREFS } from "$lib/services/notification-prefs";
import { clearDndState } from "$lib/services/dnd-state.svelte";
import { clearRuntimeBadges } from "$lib/services/runtime-badges.svelte";
import {
  WORKSPACES_STATE_KEY,
  WORKSPACES_STATE_VERSION,
  type WorkspaceGroupsState,
} from "$lib/services/workspace-groups";
import WorkspacePage from "./+page.svelte";

const invoke = vi.hoisted(() => vi.fn());
const listen = vi.hoisted(() => {
  const handlers: Record<string, (event: { payload: unknown }) => void> = {};
  const fn = vi.fn((event: string, callback: (event: { payload: unknown }) => void) => {
    handlers[event] = callback;
    return Promise.resolve(() => {
      if (handlers[event] === callback) {
        delete handlers[event];
      }
    });
  });
  return Object.assign(fn, { handlers });
});
const tauriWindow = vi.hoisted(() => {
  const state = {
    visible: true,
    minimized: false,
    focusHandler: null as ((event: { payload: boolean }) => void) | null,
  };
  return {
    state,
    isVisible: vi.fn(() => Promise.resolve(state.visible)),
    isMinimized: vi.fn(() => Promise.resolve(state.minimized)),
    onFocusChanged: vi.fn((handler: (event: { payload: boolean }) => void) => {
      state.focusHandler = handler;
      return Promise.resolve(() => {
        state.focusHandler = null;
      });
    }),
  };
});
const nativeNotification = vi.hoisted(() => ({
  isPermissionGranted: vi.fn(() => Promise.resolve(true)),
  requestPermission: vi.fn(() => Promise.resolve("granted")),
  sendNotification: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isVisible: tauriWindow.isVisible,
    isMinimized: tauriWindow.isMinimized,
    onFocusChanged: tauriWindow.onFocusChanged,
  }),
}));

vi.mock("@tauri-apps/plugin-notification", () => nativeNotification);

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
  await new Promise((resolve) => setTimeout(resolve, 2));
  flushSync();
}

async function emitTauriEvent(event: string, payload: unknown) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const handler = listen.handlers[event];
    if (typeof handler === "function") {
      handler({ payload });
      return;
    }
    await settle();
  }
  throw new Error(`Tauri event handler was not registered: ${event}`);
}

async function waitFor(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
  flushSync();
}

async function settleFakeTimers(ms = 2) {
  flushSync();
  await Promise.resolve();
  await vi.advanceTimersByTimeAsync(ms);
  flushSync();
}

function setDocumentVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value,
  });
}

async function unmountPage(component: ReturnType<typeof mount>) {
  await settle();
  unmount(component);
  await settle();
}

async function unmountPageFakeTimers(component: ReturnType<typeof mount>) {
  await settleFakeTimers();
  unmount(component);
  await settleFakeTimers();
}

describe("workspace switching webview commands", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    setDocumentVisibility("visible");
    tauriWindow.state.visible = true;
    tauriWindow.state.minimized = false;
    tauriWindow.state.focusHandler = null;
    tauriWindow.isVisible.mockClear();
    tauriWindow.isMinimized.mockClear();
    tauriWindow.onFocusChanged.mockClear();
    localStorage.clear();
    invoke.mockReset();
    listen.mockReset();
    for (const event of Object.keys(listen.handlers)) {
      delete listen.handlers[event];
    }
    listen.mockImplementation((event: string, callback: (event: { payload: unknown }) => void) => {
      listen.handlers[event] = callback;
      return Promise.resolve(() => {
        if (listen.handlers[event] === callback) {
          delete listen.handlers[event];
        }
      });
    });
    nativeNotification.isPermissionGranted.mockReset();
    nativeNotification.isPermissionGranted.mockResolvedValue(true);
    nativeNotification.requestPermission.mockReset();
    nativeNotification.requestPermission.mockResolvedValue("granted");
    nativeNotification.sendNotification.mockReset();
    clearDndState();
    clearRuntimeBadges();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    setDocumentVisibility("visible");
  });

  it("applies saved dark appearance on workspace startup", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    localStorage.setItem(
      "ferx-app-settings",
      JSON.stringify({
        spellCheckEnabled: true,
        resourceUsageMonitoringEnabled: false,
        themeMode: "dark",
      }),
    );
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    await unmountPage(component);
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

    await unmountPage(component);
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

    await unmountPage(component);
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

    await unmountPage(component);
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
      showBadge: true,
      affectTray: true,
      muteAudio: false,
      showNativeNotifications: true,
    });

    await unmountPage(component);
  });

  it("shows the native service context menu for saved services with legacy notification prefs", async () => {
    const state = createWorkspaceState();
    state.servicesById.youtube.notificationPrefs = {
      showBadge: true,
      affectTray: true,
      allowNotifications: false,
    } as unknown as typeof state.servicesById.youtube.notificationPrefs;
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));
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
      showBadge: true,
      affectTray: true,
      muteAudio: true,
      showNativeNotifications: true,
    });

    await unmountPage(component);
  });

  it("shows the native service context menu for disabled services", async () => {
    const state = createWorkspaceState();
    state.workspaces[0].serviceIds.push("mail");
    state.servicesById.mail = {
      id: "mail",
      name: "Mail",
      url: "https://outlook.office.com/mail/",
      storageKey: "storage-mail",
      notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
      disabled: true,
    };
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>('button[title="Mail (Cmd+2)"]')
      ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await settle();

    expect(invoke).toHaveBeenCalledWith("show_context_menu", {
      id: "mail",
      disabled: true,
      showBadge: true,
      affectTray: true,
      muteAudio: false,
      showNativeNotifications: true,
    });

    await unmountPage(component);
  });

  it("reloads the selected service when the native reload menu action fires", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    listen.mockImplementation((event, callback) => {
      listeners.set(event, callback as (event: { payload: unknown }) => void);
      return Promise.resolve(() => {});
    });
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();
    invoke.mockClear();

    listeners.get("menu-action")?.({ payload: "reload:youtube" });
    await settle();

    expect(invoke).toHaveBeenCalledWith("reload_webview", { payload: { id: "youtube" } });

    await unmountPage(component);
  });

  it("closes a service webview without deleting storage when the native disable menu action fires", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    const listeners = new Map<string, (event: { payload: unknown }) => void>();
    listen.mockImplementation((event, callback) => {
      listeners.set(event, callback as (event: { payload: unknown }) => void);
      return Promise.resolve(() => {});
    });
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();
    invoke.mockClear();

    listeners.get("menu-action")?.({ payload: "toggle:youtube" });
    await settle();

    expect(invoke).toHaveBeenCalledWith("close_webview", { payload: { id: "youtube" } });
    expect(invoke).not.toHaveBeenCalledWith(
      "delete_webview",
      expect.objectContaining({ payload: expect.objectContaining({ id: "youtube" }) }),
    );

    await unmountPage(component);
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

    await unmountPage(component);
  });

  it("hibernates an inactive service after switching away for 60 seconds", async () => {
    vi.useFakeTimers();
    const state = createWorkspaceState();
    state.workspaces[0].serviceIds = ["youtube", "gemini"];
    state.servicesById.youtube.hibernateWhenInactive = true;
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, { target: document.body });
    await settleFakeTimers();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>('button[title^="Gemini"]')?.click();
    await settleFakeTimers();
    await vi.advanceTimersByTimeAsync(59997);
    expect(invoke).not.toHaveBeenCalledWith("close_webview", { payload: { id: "youtube" } });

    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledWith("close_webview", { payload: { id: "youtube" } });
    expect(invoke).not.toHaveBeenCalledWith(
      "delete_webview",
      expect.objectContaining({ payload: expect.objectContaining({ id: "youtube" }) }),
    );

    await unmountPageFakeTimers(component);
  });

  it("cancels pending hibernation when switching back before the delay", async () => {
    vi.useFakeTimers();
    const state = createWorkspaceState();
    state.workspaces[0].serviceIds = ["youtube", "gemini"];
    state.servicesById.youtube.hibernateWhenInactive = true;
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, { target: document.body });
    await settleFakeTimers();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>('button[title^="Gemini"]')?.click();
    await settleFakeTimers();
    document.querySelector<HTMLButtonElement>('button[title^="YouTube Music"]')?.click();
    await settleFakeTimers();
    await vi.advanceTimersByTimeAsync(60000);

    expect(invoke).not.toHaveBeenCalledWith("close_webview", { payload: { id: "youtube" } });

    await unmountPageFakeTimers(component);
  });

  it("does not close a service that is woken after the hibernation timer fires but before the close command runs", async () => {
    vi.useFakeTimers();
    const state = createWorkspaceState();
    state.workspaces[0].serviceIds = ["youtube", "gemini"];
    state.servicesById.youtube.hibernateWhenInactive = true;
    state.servicesById.gemini.notificationPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      muteAudio: true,
    };
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));

    let resolveAudioMute: () => void = () => {};
    invoke.mockImplementation((command: string) => {
      if (command === "set_service_webview_audio_muted") {
        return new Promise<void>((resolve) => {
          resolveAudioMute = resolve;
        });
      }
      return Promise.resolve();
    });

    const component = mount(WorkspacePage, { target: document.body });
    await settleFakeTimers();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>('button[title^="Gemini"]')?.click();
    await settleFakeTimers();
    await vi.advanceTimersByTimeAsync(60000);
    await Promise.resolve();

    document.querySelector<HTMLButtonElement>('button[title^="YouTube Music"]')?.click();
    await settleFakeTimers();

    resolveAudioMute();
    await settleFakeTimers();
    await settleFakeTimers();

    expect(invoke).not.toHaveBeenCalledWith("close_webview", { payload: { id: "youtube" } });

    await unmountPageFakeTimers(component);
  });

  it("hibernates the active service after Ferx is hidden for 60 seconds", async () => {
    vi.useFakeTimers();
    const state = createWorkspaceState();
    state.servicesById.youtube.hibernateWhenInactive = true;
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, { target: document.body });
    await settleFakeTimers();
    invoke.mockClear();

    tauriWindow.state.visible = false;
    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await settleFakeTimers();
    await vi.advanceTimersByTimeAsync(60000);
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledWith("close_webview", { payload: { id: "youtube" } });

    await unmountPageFakeTimers(component);
  });

  it("wakes a hibernated active service when Ferx becomes visible again", async () => {
    vi.useFakeTimers();
    const state = createWorkspaceState();
    state.servicesById.youtube.hibernateWhenInactive = true;
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, { target: document.body });
    await settleFakeTimers();
    invoke.mockClear();

    tauriWindow.state.visible = false;
    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await settleFakeTimers();
    await vi.advanceTimersByTimeAsync(60000);
    await Promise.resolve();
    invoke.mockClear();

    tauriWindow.state.visible = true;
    tauriWindow.state.minimized = false;
    setDocumentVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await settleFakeTimers();
    await settleFakeTimers();

    expect(invoke).toHaveBeenCalledWith(
      "open_service",
      expect.objectContaining({ payload: expect.objectContaining({ id: "youtube" }) }),
    );

    await unmountPageFakeTimers(component);
  });

  it("wakes the active service if Ferx becomes visible while hibernation close is still in flight", async () => {
    vi.useFakeTimers();
    const state = createWorkspaceState();
    state.servicesById.youtube.hibernateWhenInactive = true;
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));

    let resolveClose: () => void = () => {};
    invoke.mockImplementation((command: string) => {
      if (command === "close_webview") {
        return new Promise<void>((resolve) => {
          resolveClose = resolve;
        });
      }
      return Promise.resolve();
    });

    const component = mount(WorkspacePage, { target: document.body });
    await settleFakeTimers();
    invoke.mockClear();

    tauriWindow.state.visible = false;
    setDocumentVisibility("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    await settleFakeTimers();
    await vi.advanceTimersByTimeAsync(60000);
    await Promise.resolve();

    expect(invoke).toHaveBeenCalledWith("close_webview", { payload: { id: "youtube" } });
    invoke.mockClear();

    tauriWindow.state.visible = true;
    tauriWindow.state.minimized = false;
    setDocumentVisibility("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    await settleFakeTimers();

    resolveClose();
    await settleFakeTimers();
    await settleFakeTimers();

    expect(invoke).toHaveBeenCalledWith(
      "open_service",
      expect.objectContaining({ payload: expect.objectContaining({ id: "youtube" }) }),
    );

    await unmountPageFakeTimers(component);
  });

  it("deletes only orphaned service webviews when deleting a workspace", async () => {
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

    expect(invoke).toHaveBeenCalledWith(
      "delete_webview",
      expect.objectContaining({ payload: expect.objectContaining({ id: "gemini" }) }),
    );
    expect(invoke).not.toHaveBeenCalledWith("delete_webview", {
      payload: expect.objectContaining({ id: "shared" }),
    });
    expect(invoke).not.toHaveBeenCalledWith("close_webview", { payload: { id: "gemini" } });

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

    await unmountPage(component);
    document.body.innerHTML = "";

    component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    expect(
      document.querySelector<HTMLElement>('[title="YouTube Music (Cmd+1)"]')?.textContent,
    ).toContain("8");

    await unmountPage(component);
  });

  it("sends a native OS notification when a known unread badge count increases", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    await emitTauriEvent("update-badge", "youtube:0");
    await settle();
    await emitTauriEvent("update-badge", "youtube:1");
    await settle();

    expect(nativeNotification.sendNotification).toHaveBeenCalledWith({
      title: "New message in YouTube Music",
      body: "YouTube Music has 1 unread message.",
      icon: "/app-icon.png",
      tag: "ferx:youtube:unread",
      data: { serviceId: "youtube" },
    });

    await unmountPage(component);
  });

  it("sends a native OS notification preview from web notification events", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    await emitTauriEvent("native-notification-preview", {
      serviceId: "youtube",
      title: "Jane Doe",
      body: "Can you check this?",
      tag: "thread-123",
    });
    await settle();

    expect(nativeNotification.sendNotification).toHaveBeenCalledWith({
      title: "Jane Doe",
      body: "Can you check this?",
      icon: "/app-icon.png",
      tag: "ferx:youtube:preview:thread-123",
      data: { serviceId: "youtube" },
    });

    await unmountPage(component);
  });

  it("does not send native OS notification previews for DND or disabled native notifications", async () => {
    const state = createWorkspaceState();
    state.servicesById.youtube.notificationPrefs = {
      ...DEFAULT_NOTIFICATION_PREFS,
      showNativeNotifications: false,
    };
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    await emitTauriEvent("native-notification-preview", {
      serviceId: "youtube",
      title: "Jane Doe",
      body: "Can you check this?",
    });
    await settle();
    expect(nativeNotification.sendNotification).not.toHaveBeenCalled();

    await unmountPage(component);

    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    const dndComponent = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    document.querySelector<HTMLButtonElement>('button[title="Turn On Do Not Disturb"]')
      ?.click();
    await settle();

    await emitTauriEvent("native-notification-preview", {
      serviceId: "youtube",
      title: "Jane Doe",
      body: "Can you check this?",
    });
    await settle();
    expect(nativeNotification.sendNotification).not.toHaveBeenCalled();

    await unmountPage(dndComponent);
  });

  it("suppresses unread-count fallback immediately after a preview notification", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    await emitTauriEvent("native-notification-preview", {
      serviceId: "youtube",
      title: "Jane Doe",
      body: "Can you check this?",
    });
    await settle();

    nativeNotification.sendNotification.mockClear();
    await emitTauriEvent("update-badge", "youtube:0");
    await settle();
    await emitTauriEvent("update-badge", "youtube:1");
    await settle();

    expect(nativeNotification.sendNotification).not.toHaveBeenCalled();

    await unmountPage(component);
  });

  it("does not send native OS notifications for initial badge reports or DND", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    await emitTauriEvent("update-badge", "youtube:4");
    await settle();
    expect(nativeNotification.sendNotification).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>('button[title="Turn On Do Not Disturb"]')
      ?.click();
    await settle();

    await emitTauriEvent("update-badge", "youtube:5");
    await settle();
    expect(nativeNotification.sendNotification).not.toHaveBeenCalled();

    await unmountPage(component);
  });

  it("mutes and unmutes service webviews when Do Not Disturb changes", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));

    const component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();
    invoke.mockClear();

    document.querySelector<HTMLButtonElement>('[title="Turn On Do Not Disturb"]')?.click();
    await settle();

    expect(invoke).toHaveBeenCalledWith("set_all_service_webviews_audio_muted", {
      payload: { muted: true },
    });

    invoke.mockClear();
    document.querySelector<HTMLButtonElement>('[title="Turn Off Do Not Disturb"]')?.click();
    await settle();

    expect(invoke).toHaveBeenCalledWith("set_all_service_webviews_audio_muted", {
      payload: { muted: false },
    });

    await unmountPage(component);
  });

  it("keeps Do Not Disturb enabled after the workspace page remounts", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));

    let component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    document.querySelector<HTMLButtonElement>('[title="Turn On Do Not Disturb"]')?.click();
    await settle();
    expect(document.querySelector('[title="Turn Off Do Not Disturb"]')).toBeTruthy();

    await unmountPage(component);
    document.body.innerHTML = "";

    component = mount(WorkspacePage, {
      target: document.body,
    });
    await settle();

    expect(document.querySelector('[title="Turn Off Do Not Disturb"]')).toBeTruthy();

    await unmountPage(component);
  });
});

describe("switching effect re-activation guard (#2)", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    invoke.mockReset();
    // Other suites call listen.mockImplementation(); mockClear() does NOT
    // restore the original capturing impl, so re-establish it here.
    listen.mockReset();
    for (const key of Object.keys(listen.handlers)) delete listen.handlers[key];
    listen.mockImplementation((event: string, callback: (event: { payload: unknown }) => void) => {
      listen.handlers[event] = callback;
      return Promise.resolve(() => {});
    });
    clearDndState();
    clearRuntimeBadges();
  });

  it("does not re-invoke open_service when a notification pref of the active service is toggled", async () => {
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(createWorkspaceState()));
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, { target: document.body });
    await settle();

    const openCallsBefore = invoke.mock.calls.filter((c) => c[0] === "open_service").length;
    expect(openCallsBefore).toBeGreaterThan(0); // initial activation happened

    // Simulate the context-menu "toggle-badge" on the active service.
    listen.handlers["menu-action"]({ payload: "toggle-badge:youtube" });
    await settle();

    const openCallsAfter = invoke.mock.calls.filter((c) => c[0] === "open_service").length;
    expect(openCallsAfter).toBe(openCallsBefore); // NO spurious re-activation

    await unmountPage(component);
  });

  it("still re-invokes open_service when switching to a different service", async () => {
    const state = createWorkspaceState();
    state.workspaces[0].serviceIds = ["youtube", "gemini"];
    localStorage.setItem(WORKSPACES_STATE_KEY, JSON.stringify(state));
    invoke.mockResolvedValue(undefined);

    const component = mount(WorkspacePage, { target: document.body });
    await settle();
    const before = invoke.mock.calls.filter((c) => c[0] === "open_service").length;

    document.querySelector<HTMLButtonElement>('button[title^="Gemini"]')?.click();
    await settle();

    const after = invoke.mock.calls.filter((c) => c[0] === "open_service").length;
    expect(after).toBe(before + 1);

    await unmountPage(component);
  });
});
